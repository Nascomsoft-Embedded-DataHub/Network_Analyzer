import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { PrivacyNotice } from '@/components/features/PrivacyNotice';
import { AlertsPage } from '@/pages/AlertsPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { DevicesPage } from '@/pages/DevicesPage';
import { DiagnosticsPage } from '@/pages/DiagnosticsPage';
import { HealthPage } from '@/pages/HealthPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PrivacyPage } from '@/pages/PrivacyPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ApiConfigProvider } from '@/providers/ApiConfigProvider';
import { ConnectionProvider } from '@/providers/ConnectionProvider';
import { PrivacyProvider, usePrivacy } from '@/providers/PrivacyProvider';
import { ToastProvider } from '@/providers/ToastProvider';

/**
 * Blocks the dashboard until the authorised-use notice is acknowledged.
 *
 * The acknowledgment is required before any device inventory can be displayed,
 * so the gate wraps the whole shell rather than a single route.
 */
function PrivacyGate({ children }: { children: React.ReactNode }) {
  const { acknowledged } = usePrivacy();

  if (!acknowledged) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg p-4 text-ink">
        <PrivacyNotice mode="gate" />
      </div>
    );
  }

  return <>{children}</>;
}

export function App() {
  return (
    <BrowserRouter>
      <ApiConfigProvider>
        <ToastProvider>
          <PrivacyProvider>
            <ConnectionProvider>
              <PrivacyGate>
                <AppShell>
                  <Routes>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/devices" element={<DevicesPage />} />
                    <Route path="/alerts" element={<AlertsPage />} />
                    <Route path="/health" element={<HealthPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/diagnostics" element={<DiagnosticsPage />} />
                    <Route path="/privacy" element={<PrivacyPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </AppShell>
              </PrivacyGate>
            </ConnectionProvider>
          </PrivacyProvider>
        </ToastProvider>
      </ApiConfigProvider>
    </BrowserRouter>
  );
}
