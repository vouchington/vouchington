'use client'

import { DisputeRow } from './dispute-row'
import { MemberDisputeRow } from './member-dispute-row'
import { DividedTableShell, type DividedTableColumn } from '@/components/admin/divided-table-shell'
import type { ReviewDisputeSummary } from '@/types/review-disputes'
import { useTranslations } from '@/lib/i18n/use-translations'

interface DisputesTableProps {
  viewerTier: 'staff' | 'member'
  disputes: ReviewDisputeSummary[]
  loadingId: string | null
  pendingRerunIds?: ReadonlySet<string>
  onOpen: (id: string) => void
}

function disputeColumns(
  t: ReturnType<typeof useTranslations>,
  viewerTier: DisputesTableProps['viewerTier'],
): DividedTableColumn[] {
  const shared: DividedTableColumn[] = [
    ['created', t('extracted.disputes.disputesTable.created_d70b9e24')],
    ['review', t('extracted.disputes.disputesTable.review_aff0766a')],
    ['reason', t('extracted.disputes.disputesTable.reason_f81ab834')],
    ['status', t('extracted.disputes.disputesTable.status_920e413c')],
  ]
  if (viewerTier === 'staff') {
    return [
      ...shared,
      ['ai-draft', t('extracted.disputes.disputesTable.aiDraft_cf76a5a2')],
      ['response', t('extracted.disputes.disputesTable.response_9061383b')],
      ['actions', t('extracted.disputes.disputesTable.actions_ff8059dc')],
    ]
  }
  return [...shared, ['resolution', t('extracted.disputes.disputesTable.resolution_d4055faf')]]
}

export function DisputesTable({
  viewerTier,
  disputes,
  loadingId,
  pendingRerunIds,
  onOpen,
}: DisputesTableProps) {
  const t = useTranslations()
  return (
    <DividedTableShell
      aria-label={t('extracted.disputes.page.reviewDisputes_25c25858')}
      columns={disputeColumns(t, viewerTier)}
      emptyMessage={t('extracted.disputes.disputesTable.noDisputes_43fb46e8')}
      isEmpty={disputes.length === 0}
    >
      {viewerTier === 'staff'
        ? disputes.map(dispute => (
            <DisputeRow
              key={dispute.id}
              dispute={dispute}
              disabled={loadingId !== null || Boolean(pendingRerunIds?.has(dispute.id))}
              onOpen={onOpen}
            />
          ))
        : disputes.map(dispute => (
            <MemberDisputeRow
              key={dispute.id}
              dispute={dispute}
            />
          ))}
    </DividedTableShell>
  )
}
