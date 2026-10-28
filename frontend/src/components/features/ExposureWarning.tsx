import { WarningIcon } from '@/components/icons';
import { useConnection } from '@/providers/ConnectionProvider';

/**
 * Warning shown when the analyser is bound beyond loopback.
 *
 * Session authentication is not implemented yet, so a LAN-bound API exposes the
 * device inventory to every device on the network. The administrator has to be
 * able to see that at a glance.
 */
export function ExposureWarning() {
  const { info } = useConnection();

  if (!info || info.loopbackOnly) return null;

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 p-4"
    >
      <span className="mt-0.5 shrink-0 text-warn">
        <WarningIcon />
      </span>
      <div className="text-sm">
        <p className="font-medium text-ink">
          This analyser is reachable by other devices on the network
        </p>
        <p className="mt-0.5 text-ink-muted">
          It is bound to {info.bindHost}:{info.bindPort}, so every device on this network can read
          the device inventory and usage history. Authentication is not implemented yet — keep the
          analyser on a trusted network until it is.
        </p>
      </div>
    </div>
  );
}
