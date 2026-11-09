import type { AdminModerationReportDuplicateCluster } from '@/components/admin/reports-client-types'

export const duplicateClusters: AdminModerationReportDuplicateCluster[] = [
  {
    id: 'content-hash:story',
    signal: 'content_hash_duplicate',
    post_count: 2,
    report_count: 4,
    report_count_capped: false,
    summary_capped: true,
    reason_breakdown: [
      { reason: 'spam', count: 3 },
      { reason: 'harassment', count: 1 },
    ],
    first_reported_at: '2026-05-31T06:00:00.000Z',
    last_reported_at: '2026-05-31T06:20:00.000Z',
    clusters: [],
  },
]
