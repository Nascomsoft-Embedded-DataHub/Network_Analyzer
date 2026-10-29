import { PageHeader } from '@/components/features/PageHeader';
import { PrivacyNotice } from '@/components/features/PrivacyNotice';

export function PrivacyPage() {
  return (
    <>
      <PageHeader
        title="Privacy notice"
        description="What the analyser records, and the acknowledgment you have given."
      />
      <PrivacyNotice mode="review" />
    </>
  );
}
