/**
 * The single mock/live switch.
 *
 * `VITE_USE_MOCKS` defaults to true so the frontend track can develop against
 * the contract fixtures without a running analyser. Day 5's swap is a change
 * of this one flag — no component, hook or provider changes behaviour based
 * on where its data came from.
 */
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false';

/** Artificial delay so loading states are visible while developing. */
export const MOCK_LATENCY_MS = 250;
