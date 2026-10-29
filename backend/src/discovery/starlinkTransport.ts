import { Client, Metadata, credentials } from '@grpc/grpc-js';

/**
 * Transports for the router's local gRPC control plane.
 *
 * The router answers on more than one port and speaks more than one dialect.
 * Two are implemented:
 *
 * - `grpc` — plain HTTP/2 with no TLS, on port 9000. This is what a standard
 *   gRPC client such as `grpcurl -plaintext` uses.
 * - `grpc-web` — HTTP/1.1 with grpc-web framing, on port 9001. Some router
 *   firmware answers this dialect more willingly than h2c.
 *
 * Both are exercised against a local server in the test suite. Neither has
 * been exercised against a physical router from this repository, because the
 * control plane is only reachable from the network the router serves.
 */

/** Sends an encoded request and returns the encoded response. */
export type StarlinkCall = (requestBytes: Buffer) => Promise<Buffer>;

export type StarlinkTransportKind = 'grpc' | 'grpc-web';

/** The method the router exposes every request through. */
export const STARLINK_HANDLE_METHOD = '/SpaceX.API.Device.Device/Handle';

const MESSAGE_FRAME = 0x00;
const TRAILERS_FRAME = 0x80;

/** grpc-web frames a message as a one-byte flag and a big-endian length. */
function encodeFrame(payload: Buffer): Buffer {
  const frame = Buffer.alloc(5 + payload.length);
  frame[0] = MESSAGE_FRAME;
  frame.writeUInt32BE(payload.length, 1);
  payload.copy(frame, 5);
  return frame;
}

/** Read the status out of a grpc-web trailers frame. */
function parseTrailers(text: string): { status: number; message: string } {
  let status = 0;
  let message = '';
  for (const line of text.split('\r\n')) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === 'grpc-status') status = Number(value);
    if (key === 'grpc-message') message = decodeURIComponent(value);
  }
  return { status, message };
}

export class StarlinkCallError extends Error {
  constructor(
    message: string,
    readonly grpcStatus: number,
  ) {
    super(message);
    this.name = 'StarlinkCallError';
  }
}

/**
 * A plain gRPC call over HTTP/2 without TLS.
 *
 * The client is created once and reused: a new connection per poll would make
 * the analyser a noisy neighbour on a device that is also serving the user's
 * traffic.
 */
export function createGrpcTransport(
  host: string,
  port: number,
  timeoutMs: number,
): { call: StarlinkCall; close: () => void } {
  const client = new Client(`${host}:${port}`, credentials.createInsecure(), {
    // The payload is encoded by the protocol module, so the transport only
    // has to move bytes.
    serialize: (value: Buffer) => value,
    deserialize: (value: Buffer) => value,
  });

  const call: StarlinkCall = (requestBytes) =>
    new Promise<Buffer>((resolve, reject) => {
      client.makeUnaryRequest(
        STARLINK_HANDLE_METHOD,
        (value: Buffer) => value,
        (value: Buffer) => value,
        requestBytes,
        new Metadata(),
        { deadline: Date.now() + timeoutMs },
        (error, value) => {
          if (error) {
            reject(error);
            return;
          }
          if (!value) {
            reject(new Error('router answered without a response body'));
            return;
          }
          resolve(value);
        },
      );
    });

  return { call, close: () => client.close() };
}

/**
 * A grpc-web call over HTTP/1.1.
 *
 * The response is a message frame followed by a trailers frame carrying the
 * gRPC status. A failure can also arrive as trailers-only, in which case the
 * status sits in the HTTP headers and the body is empty.
 */
export function createGrpcWebTransport(
  host: string,
  port: number,
  timeoutMs: number,
): { call: StarlinkCall; close: () => void } {
  const call: StarlinkCall = async (requestBytes) => {
    const url = `http://${host}:${port}${STARLINK_HANDLE_METHOD}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/grpc-web+proto',
        'X-Grpc-Web': '1',
      },
      body: encodeFrame(requestBytes),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const headerStatus = response.headers.get('grpc-status');
    if (headerStatus !== null && Number(headerStatus) !== 0) {
      throw new StarlinkCallError(
        response.headers.get('grpc-message') ?? 'router refused the call',
        Number(headerStatus),
      );
    }
    if (!response.ok) {
      throw new StarlinkCallError(`HTTP ${response.status}`, response.status);
    }

    const body = Buffer.from(await response.arrayBuffer());
    let message: Buffer | null = null;
    let offset = 0;
    while (offset + 5 <= body.length) {
      const flag = body[offset]!;
      const length = body.readUInt32BE(offset + 1);
      const payload = body.subarray(offset + 5, offset + 5 + length);
      offset += 5 + length;

      if (flag === MESSAGE_FRAME) {
        message = Buffer.from(payload);
      } else if (flag & TRAILERS_FRAME) {
        const trailers = parseTrailers(payload.toString('utf8'));
        if (trailers.status !== 0) {
          throw new StarlinkCallError(trailers.message, trailers.status);
        }
      }
    }

    if (message === null) {
      throw new StarlinkCallError('response carried no message frame', 2);
    }
    return message;
  };

  return { call, close: () => undefined };
}
