import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, Input } from '@/components/ui';
import { PageHeader } from '@/components/features/PageHeader';
import { useApiConfig, type ConnectionTestResult } from '@/providers/ApiConfigProvider';
import { useToast } from '@/providers/ToastProvider';
import { DEFAULT_API_BASE_URL } from '@/state/apiConfig';

export function SettingsPage() {
  const { baseUrl, setBaseUrl, resetBaseUrl, testConnection, isMock } = useApiConfig();
  const { show } = useToast();
  const [draft, setDraft] = useState(baseUrl);
  const [error, setError] = useState<string | undefined>(undefined);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ConnectionTestResult | null>(null);

  const onSave = () => {
    try {
      setBaseUrl(draft);
      setError(undefined);
      setResult(null);
      show({ title: 'Analyser address saved', tone: 'ok' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That address could not be saved.');
    }
  };

  const onTest = async () => {
    setTesting(true);
    setResult(await testConnection(draft));
    setTesting(false);
  };

  return (
    <>
      <PageHeader
        title="Settings"
        description="Where the dashboard looks for the analyser, and the notices you have acknowledged."
      />

      <div className="space-y-4">
        <Card
          title="Analyser address"
          subtitle="The address of the machine running the analyser."
        >
          <div className="space-y-4">
            <Input
              label="API base URL"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              error={error}
              hint="On the laptop this is http://localhost:3000. On the phone it is the laptop's LAN address, for example http://192.168.1.24:3000."
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={onSave}>Save address</Button>
              <Button
                variant="secondary"
                onClick={() => void onTest()}
                loading={testing}
              >
                Test connection
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  resetBaseUrl();
                  setDraft(DEFAULT_API_BASE_URL);
                  setError(undefined);
                  setResult(null);
                }}
              >
                Reset to {DEFAULT_API_BASE_URL}
              </Button>
            </div>

            {result ? (
              <div
                role="status"
                className="rounded-lg border border-line bg-surface-2 p-3 text-sm"
              >
                {result.ok ? (
                  <p className="text-ink">
                    <span className="font-medium">{result.info.hostname}</span> answered — version{' '}
                    {result.info.version}, bound to {result.info.bindHost}:{result.info.bindPort}.
                  </p>
                ) : (
                  <p className="text-danger">{result.message}</p>
                )}
              </div>
            ) : null}
          </div>
        </Card>

        <Card title="Data source" subtitle="Where this dashboard's figures come from.">
          <div className="flex flex-wrap items-center gap-3 text-sm text-ink-muted">
            <Badge tone={isMock ? 'warn' : 'ok'}>{isMock ? 'Mock data' : 'Live API'}</Badge>
            <p>
              {isMock
                ? 'Responses are coming from the contract fixtures, so no analyser is contacted. Day 5 swaps this by setting VITE_USE_MOCKS=false.'
                : 'Responses are coming from the live analyser at the address above.'}
            </p>
          </div>
        </Card>

        <Card title="Privacy" subtitle="The authorised use acknowledgment.">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/privacy"
              className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink"
            >
              Open the privacy notice
            </Link>
            <p className="text-sm text-ink-muted">
              The notice blocks the dashboard on first launch and is reachable from here afterwards.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
