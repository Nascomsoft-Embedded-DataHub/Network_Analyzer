import { render, screen, waitFor, within } from '@testing-library/react';
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
    expect(screen.queryByRole('heading', { name: 'Network now' })).toBeNull();
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
    // The dashboard shell renders its panels rather than a placeholder.
    expect(screen.getByRole('heading', { name: 'Network now' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Peak usage' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Health snapshot' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Recent alerts' })).toBeTruthy();
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

describe('navigation drawer', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  async function openShell(user: ReturnType<typeof userEvent.setup>) {
    render(<App />);

    await screen.findByRole('heading', { name: /authorised use acknowledgement/i });
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /acknowledge and continue/i }));

    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
    });
  }

  /** The backdrop is the first layer of the drawer overlay. */
  function backdrop(): HTMLElement {
    const drawer = screen.getByRole('navigation', { name: 'Main menu' });
    const layer = drawer.parentElement?.firstElementChild;
    if (!(layer instanceof HTMLElement)) throw new Error('The drawer backdrop is missing.');
    return layer;
  }

  it('starts closed, behind an accessible menu button', async () => {
    const user = userEvent.setup();
    await openShell(user);

    expect(screen.queryByRole('navigation', { name: 'Main menu' })).toBeNull();

    const menu = screen.getByRole('button', { name: 'Open navigation' });
    expect(menu.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens as an overlay and locks the page behind it', async () => {
    const user = userEvent.setup();
    await openShell(user);

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));

    const drawer = await screen.findByRole('navigation', { name: 'Main menu' });
    expect(drawer).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open navigation' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
    // The page behind the drawer does not scroll.
    expect(document.body.style.overflow).toBe('hidden');
    // Focus moves into the drawer.
    expect(document.activeElement).toBe(drawer);
  });

  it('closes when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    await openShell(user);

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    await screen.findByRole('navigation', { name: 'Main menu' });

    await user.click(backdrop());

    await waitFor(() => {
      expect(screen.queryByRole('navigation', { name: 'Main menu' })).toBeNull();
    });
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('closes when Escape is pressed', async () => {
    const user = userEvent.setup();
    await openShell(user);

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    await screen.findByRole('navigation', { name: 'Main menu' });

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('navigation', { name: 'Main menu' })).toBeNull();
    });
    expect(document.body.style.overflow).not.toBe('hidden');
    // Focus returns to the button that opened the drawer.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open navigation' }));
  });

  it('closes when a destination is chosen, and marks the active route', async () => {
    const user = userEvent.setup();
    await openShell(user);

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    const drawer = await screen.findByRole('navigation', { name: 'Main menu' });

    const devicesLink = within(drawer).getByRole('link', { name: 'Devices' });
    await user.click(devicesLink);

    await waitFor(() => {
      expect(screen.queryByRole('navigation', { name: 'Main menu' })).toBeNull();
    });
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Devices' })).toBeTruthy();
    });
    // The route that is open is marked in the navigation.
    const sidebar = screen.getByRole('navigation', { name: 'Main' });
    expect(within(sidebar).getByRole('link', { name: 'Devices' }).className).toContain(
      'bg-surface-2',
    );
  });
});
