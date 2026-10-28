import { ErrorResponseSchema } from '@network-analyser/contracts';
import type { z } from 'zod';
import { USE_MOCKS } from './config';
import { resolveMock } from './mock';
import { readApiBaseUrl } from '@/state/apiConfig';

/**
 * The typed API client.
 *
 * Routes are never spelled as string literals: every call goes through the
 * `ApiRoutes` registry from `@network-analyser/contracts`, so the path, the
 * method and the response shape always come from the shared contract. The
 * response type is inferred from the registry entry.
 */

export interface ApiRoute {
  method: string;
  path: string;
  response: z.ZodTypeAny;
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
}

export type ApiResponseOf<R extends ApiRoute> = z.infer<R['response']>;

export interface CallOptions {
  /** Values for `:id`-style placeholders in the route path. */
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
  signal?: AbortSignal;
  /** Overrides the configured base URL for this call — used by "test connection". */
  baseUrl?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, status: number, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function buildPath(template: string, params?: Record<string, string>): string {
  if (!params) return template;
  return template.replace(/:([A-Za-z0-9_]+)/g, (_match, key: string) => {
    const value = params[key];
    if (value === undefined) {
      throw new Error(`Missing path parameter "${key}" for route "${template}".`);
    }
    return encodeURIComponent(value);
  });
}

function buildQueryString(query?: Record<string, unknown>): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const entry of value) params.append(key, String(entry));
      continue;
    }
    params.append(key, String(value));
  }
  const serialised = params.toString();
  return serialised ? `?${serialised}` : '';
}

async function toApiError(response: Response): Promise<ApiError> {
  let code = 'HTTP_ERROR';
  let message = `Request failed with status ${response.status}.`;
  let details: Record<string, unknown> | undefined;

  try {
    const body: unknown = await response.json();
    const parsed = ErrorResponseSchema.safeParse(body);
    if (parsed.success) {
      code = parsed.data.error.code;
      message = parsed.data.error.message;
      details = parsed.data.error.details;
    }
  } catch {
    // The body was not the standard error envelope.
  }

  return new ApiError(message, response.status, code, details);
}

/**
 * Calls a route from the registry.
 *
 * In mock mode the contract fixtures answer the call; in live mode the request
 * goes to the configured base URL. Either way the response is validated
 * against the contract schema before it is returned, so a shape that drifts
 * from the contract surfaces as an error rather than as undefined fields.
 */
export async function callApi<R extends ApiRoute>(
  route: R,
  options: CallOptions = {},
): Promise<ApiResponseOf<R>> {
  const path = buildPath(route.path, options.params);

  if (USE_MOCKS) {
    const payload = resolveMock(route, {
      params: options.params ?? {},
      query: options.query ?? {},
      body: options.body,
    });
    return parsePayload(route, payload, 'mock');
  }

  const queryString = buildQueryString(options.query);
  const baseUrl = options.baseUrl ?? readApiBaseUrl();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}${queryString}`, {
      method: route.method,
      headers: {
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (cause) {
    throw new ApiError(
      `Could not reach the analyser at ${baseUrl}. Check that it is running and that the API base URL is correct.`,
      0,
      'NETWORK_ERROR',
      { cause: cause instanceof Error ? cause.message : String(cause) },
    );
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  const payload: unknown = await response.json();
  return parsePayload(route, payload, 'live');
}

function parsePayload<R extends ApiRoute>(
  route: R,
  payload: unknown,
  source: 'mock' | 'live',
): ApiResponseOf<R> {
  const parsed = route.response.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(
      `The ${source} response for ${route.method} ${route.path} does not match the API contract.`,
      0,
      'CONTRACT_MISMATCH',
      { issues: parsed.error.issues },
    );
  }
  return parsed.data as ApiResponseOf<R>;
}
