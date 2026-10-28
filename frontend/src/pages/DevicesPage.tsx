import { EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/features/PageHeader';

export function DevicesPage() {
  return (
    <>
      <PageHeader
        title="Devices"
        description="Every device seen on the network, with its IP and MAC address."
      />
      <EmptyState
        title="The device list is not built yet"
        description="The device table — and its stacked card layout for phones — arrives once the discovery engine is producing records. It will be built against GET /api/devices, which is already in the API contract."
      />
    </>
  );
}
