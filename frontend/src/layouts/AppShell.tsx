import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { IconButton, StatusIndicator } from '@/components/ui';
import {
  AlertsIcon,
  DashboardIcon,
  DevicesIcon,
  DiagnosticsIcon,
  HealthIcon,
  MenuIcon,
  SettingsIcon,
} from '@/components/icons';
import { ConnectionBanner } from '@/components/features/ConnectionBanner';
import { ExposureWarning } from '@/components/features/ExposureWarning';
import { useConnection } from '@/providers/ConnectionProvider';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: <DashboardIcon />, end: true },
  { to: '/devices', label: 'Devices', icon: <DevicesIcon />, end: false },
  { to: '/alerts', label: 'Alerts', icon: <AlertsIcon />, end: false },
  { to: '/health', label: 'Health', icon: <HealthIcon />, end: false },
  { to: '/diagnostics', label: 'Diagnostics', icon: <DiagnosticsIcon />, end: false },
  { to: '/settings', label: 'Settings', icon: <SettingsIcon />, end: false },
];

const CONNECTION_LABELS: Record<string, string> = {
  connecting: 'connecting',
  loaded: 'connected',
  unreachable: 'unreachable',
  partial: 'partial data',
};

/**
 * Application shell: top bar, navigation content area.
 *
 * The phone is the tighter constraint, so the navigation is a drawer below
 * 900px and a static column from 900px up. The drawer is closed by default,
 * opens from the menu button in the header, and closes on the backdrop, on
 * Escape, or on navigation.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const { status } = useConnection();
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);

  // Escape closes the drawer from anywhere on the page.
  useEffect(() => {
    if (!navOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setNavOpen(false);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navOpen]);

  // The page behind the drawer must not scroll while it is open.
  useEffect(() => {
    if (!navOpen) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [navOpen]);

  // Move focus into the drawer when it opens, and back to the button that
  // opened it when it closes.
  useEffect(() => {
    if (navOpen) {
      drawerRef.current?.focus();
      wasOpen.current = true;
      return;
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      menuButtonRef.current?.focus();
    }
  }, [navOpen]);

  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="flex w-full items-center gap-3 px-4 py-2 min-[901px]:h-14 min-[901px]:py-0">
          <IconButton
            ref={menuButtonRef}
            className="min-[901px]:hidden"
            label="Open navigation"
            icon={<MenuIcon />}
            aria-expanded={navOpen}
            aria-controls="main-menu"
            onClick={() => setNavOpen(true)}
          />
          <span className="truncate text-sm font-semibold text-ink">Network Analyser</span>
          <div className="ml-auto flex items-center gap-2">
            <StatusIndicator
              status={
                status === 'loaded'
                  ? 'online'
                  : status === 'unreachable'
                    ? 'down'
                    : status === 'partial'
                      ? 'degraded'
                      : 'unknown'
              }
              label={CONNECTION_LABELS[status]}
            />
          </div>
        </div>
      </header>

      <div className="flex w-full flex-1">
        <nav
          aria-label="Main"
          className="hidden w-52 shrink-0 border-r border-line p-3 min-[901px]:sticky min-[901px]:top-14 min-[901px]:block min-[901px]:h-[calc(100dvh-3.5rem)]"
        >
          <NavList />
        </nav>

        <main id="main-content" className="min-w-0 flex-1 p-4 pb-20 min-[901px]:pb-8">
          <div className="mx-auto w-full max-w-6xl">
            <ConnectionBanner />
            <ExposureWarning />
            {children}
          </div>
        </main>
      </div>

      {navOpen ? (
        <div className="fixed inset-0 z-40 min-[901px]:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setNavOpen(false)}
            aria-hidden="true"
          />
          <nav
            id="main-menu"
            ref={drawerRef}
            tabIndex={-1}
            aria-label="Main menu"
            className="absolute inset-y-0 left-0 w-64 max-w-[80%] overflow-y-auto border-r border-line bg-surface p-3 focus:outline-none"
          >
            <NavList onNavigate={() => setNavOpen(false)} />
          </nav>
        </div>
      ) : null}
    </div>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium',
                isActive ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
              )
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
