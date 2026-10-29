import { useState, type ReactNode } from 'react';
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
 * The application shell: top bar, navigation and the content area.
 *
 * The phone is the tighter constraint, so the navigation is a drawer below the
 * `md` breakpoint and a static column from `md` up.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const { status } = useConnection();

  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="flex w-full items-center gap-3 px-4 py-2 md:h-14 md:py-0">
          <IconButton
            className="md:hidden"
            label="Open navigation"
            icon={<MenuIcon />}
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
          className="hidden w-52 shrink-0 border-r border-line p-3 md:sticky md:top-14 md:block md:h-[calc(100dvh-3.5rem)]"
        >
          <NavList />
        </nav>

        <main id="main-content" className="min-w-0 flex-1 p-4 pb-20 md:pb-8">
          <div className="mx-auto w-full max-w-6xl">
            <ConnectionBanner />
            <ExposureWarning />
            {children}
          </div>
        </main>
      </div>

      {navOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setNavOpen(false)}
            aria-hidden="true"
          />
          <nav
            aria-label="Main"
            className="absolute inset-y-0 left-0 w-64 max-w-[80%] overflow-y-auto border-r border-line bg-surface p-3"
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
