'use client';

import { MarketingSubtabsPage } from '@/components/marketing/marketing-subtabs-page';
import { VideoGenerator } from '@/components/marketing/video-generator';

// Subabas novas só no CRM da Concept (NEXT_PUBLIC_MARKETING_SUBTABS=1). Nos outros CRMs segue o gerador de vídeo.
const SUBTABS_ON = process.env.NEXT_PUBLIC_MARKETING_SUBTABS === '1';

export default function MarketingPage() {
  return SUBTABS_ON ? <MarketingSubtabsPage /> : <VideoGenerator />;
}
