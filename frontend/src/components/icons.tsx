import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      className="size-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Icon>
  );
}

export function DevicesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="4" width="14" height="9" rx="1.5" />
      <rect x="16" y="9" width="6" height="11" rx="1.5" />
      <path d="M6 17h6M9 17v4" />
    </Icon>
  );
}

export function AlertsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 21 19H3l9-15.5Z" />
      <path d="M12 10v4M12 17h.01" />
    </Icon>
  );
}

export function HealthIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12h4l2.5-6 4 12 2.5-6h5" />
    </Icon>
  );
}

export function DiagnosticsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6h16M4 12h16M4 18h10" />
      <circle cx="18" cy="18" r="2.2" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
    </Icon>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3 5 6v6c0 4.2 2.9 7.9 7 9 4.1-1.1 7-4.8 7-9V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20 4v4h-4" />
    </Icon>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 21 19H3l9-15.5Z" />
      <path d="M12 10v4M12 17h.01" />
    </Icon>
  );
}
