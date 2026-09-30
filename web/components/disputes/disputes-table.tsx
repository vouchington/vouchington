'use client'

import type { ReactNode } from 'react'
import { DisputeRow } from './dispute-row'
import { MemberDisputeRow } from './member-dispute-row'
import { DividedTableShell, type DividedTableColumn } from '@/components/admin/divided-table-shell'
import type { ReviewDispute } from '@/types/review-disputes'
import { useTranslations } from '@/lib/i18n/use-translations'

interface DisputesTableProps {
  viewerTier: 'staff' | 'member'
  disputes: ReviewDispute[]
  draftEdits: Record<string, string>
  loadingId: string | null
  onEdit: (id: string, text: string) => void
  onApprove: (id: string) => void
  onSend: (id: string) => void
  onRerunAI: (id: string) => void
  onResolve: (id: string, action: 'remove' | 'dismiss') => void
  onAnnotate: (id: string, text: string) => void
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

function disputeRows({
  viewerTier,
  disputes,
  draftEdits,
  loadingId,
  onEdit,
  onApprove,
  onSend,
  onRerunAI,
  onResolve,
  onAnnotate,
}: DisputesTableProps): ReactNode {
  if (viewerTier === 'staff') {
    return disputes.map(dispute => (
      <DisputeRow
        key={dispute.id}
        dispute={{
          ...dispute,
          public_response: draftEdits[dispute.id] ?? dispute.public_response,
        }}
        disabled={loadingId !== null}
        onEdit={onEdit}
        onApprove={onApprove}
        onSend={onSend}
        onRerunAI={onRerunAI}
        onResolve={onResolve}
        onAnnotate={onAnnotate}
      />
    ))
  }
  return disputes.map(dispute => (
    <MemberDisputeRow
      key={dispute.id}
      dispute={dispute}
    />
  ))
}

export function DisputesTable(props: DisputesTableProps) {
  const t = useTranslations()
  return (
    <DividedTableShell
      aria-label={t('extracted.disputes.page.reviewDisputes_25c25858')}
      columns={disputeColumns(t, props.viewerTier)}
      emptyMessage={t('extracted.disputes.disputesTable.noDisputes_43fb46e8')}
      isEmpty={props.disputes.length === 0}
    >
      {disputeRows(props)}
    </DividedTableShell>
  )
}
