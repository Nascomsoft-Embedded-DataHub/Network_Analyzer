import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/App';

describe('application shell', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('blocks on the privacy acknowledgment before any dashboard content', async () => {
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: /authorised use acknowledgement/i }),
    ).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(screen.queryByText(/the dashboard is not built yet/i)).toBeNull();
  });

  it('reaches the dashboard once the notice is acknowledged', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('heading', { name: /authorised use acknowledgement/i });

    // The acknowledge button stays disabled until the box is ticked.
    const acknowledge = screen.getByRole('button', { name: /acknowledge and continue/i });
    expect(acknowledge.hasAttribute('disabled')).toBe(true);

    await user.click(screen.getByRole('checkbox'));
    expect(acknowledge.hasAttribute('disabled')).toBe(false);

    await user.click(acknowledge);

    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
    });
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByText(/the dashboard is not built yet/i)).toBeTruthy();
  });

  it('keeps the acknowledgment across a reload', async () => {
    const user = userEvent.setup();
    const first = render(<App />);

    await screen.findByRole('heading', { name: /authorised use acknowledgement/i });
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /acknowledge and continue/i }));

    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
    });
    first.unmount();

    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
    });
    expect(screen.queryByRole('heading', { name: /authorised use acknowledgement/i })).toBeNull();
  });

  it('navigates between the route-level screens', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('heading', { name: /authorised use acknowledgement/i });
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /acknowledge and continue/i }));

    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
    });

    await user.click(screen.getByRole('link', { name: 'Diagnostics' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Diagnostics' })).toBeTruthy();
    });
    // The diagnostics panel shows the analyser the mock backend reports. The
    // responsive table renders both the wide and the card layout, so the
    // hostname appears in each.
    expect((await screen.findAllByText('MOCK-LAPTOP')).length).toBeGreaterThan(0);
  });
});
