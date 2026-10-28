import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// React Testing Library's automatic cleanup relies on a global `afterEach`.
// The suite runs without Vitest globals, so it is registered here instead.
afterEach(() => {
  cleanup();
});
