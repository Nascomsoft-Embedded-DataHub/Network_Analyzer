import { useState } from 'react';
import { Button, Card } from '@/components/ui';
import { ShieldIcon } from '@/components/icons';
import { usePrivacy } from '@/providers/PrivacyProvider';
import { readPrivacyAcknowledgedAt } from '@/state/privacy';
import { formatTimestamp } from '@/lib/format';

export interface PrivacyNoticeProps {
  /**
   * `gate` blocks the dashboard until the notice is acknowledged. `review`
   * is the version reachable from Settings once it has been acknowledged.
   */
  mode: 'gate' | 'review';
}

/**
 * The administrator acknowledgment required by the roadmap's notice
 * requirement. It is a UI surface rather than a legal footnote, and it is
 * shown before any device inventory can be displayed.
 */
export function PrivacyNotice({ mode }: PrivacyNoticeProps) {
  const { acknowledged, acknowledge, revoke } = usePrivacy();
  const [confirmed, setConfirmed] = useState(false);
  const acknowledgedAt = readPrivacyAcknowledgedAt();

  if (mode === 'review' && acknowledged) {
    return (
      <Card title="Authorised use acknowledgement" subtitle="Your acknowledgment is on record for this browser.">
        <div className="space-y-4 text-sm text-ink-muted">
          <p>
            Acknowledged{acknowledgedAt ? ` on ${formatTimestamp(acknowledgedAt)}` : ''}. The
            acknowledgement is stored in this browser only — clearing site data resets it and the
            notice will block again on the next launch.
          </p>
          <Button variant="secondary" onClick={revoke}>
            Withdraw acknowledgement
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className={mode === 'gate' ? 'mx-auto max-w-2xl' : undefined}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-accent">
          <ShieldIcon />
        </span>
        <div className="min-w-0 space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-ink">Authorised use acknowledgement</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Read this before the dashboard shows any device inventory.
            </p>
          </div>

          <div className="space-y-3 text-sm text-ink">
            <p>
              The Network Analyser reports bandwidth consumption, connected devices and link health
              for the network it is installed on. It reads network headers and metadata only — never
              message contents, browsing activity, DNS query names or file contents.
            </p>
            <p>
              Use it only on a network you own or are authorised to administer. Telemetry is stored
              on the machine running the analyser and is not sent to any external service.
            </p>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-line bg-surface-2 p-3 text-sm text-ink">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
            />
            <span>
              I confirm this is a network I own, or one I have written authorisation to monitor.
            </span>
          </label>

          <Button
            onClick={acknowledge}
            disabled={!confirmed}
            fullWidth
            size="lg"
            className="sm:w-auto"
          >
            Acknowledge and continue
          </Button>
        </div>
      </div>
    </Card>
  );
}
