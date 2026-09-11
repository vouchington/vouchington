'use client'

import { DisputeRow } from './dispute-row'
import { MemberDisputeRow } from './member-dispute-row'
import { AdminTableShell } from '@/components/admin/admin-table-shell'
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

export function DisputesTable({
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
}: DisputesTableProps) {
  const t = useTranslations()
  const isEmpty = disputes.length === 0

  return (
    <AdminTableShell
      aria-label={t('extracted.disputes.page.reviewDisputes_25c25858')}
      isEmpty={isEmpty}
      emptyMessage={t('extracted.disputes.disputesTable.noDisputes_43fb46e8')}
    >
      <table className='min-w-full divide-y divide-border'>
        <thead className='bg-muted/50'>
          <tr>
            <th className='px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
              {t('extracted.disputes.disputesTable.created_d70b9e24')}
            </th>
            <th className='px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
              {t('extracted.disputes.disputesTable.review_aff0766a')}
            </th>
            <th className='px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
              {t('extracted.disputes.disputesTable.reason_f81ab834')}
            </th>
            <th className='px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
              {t('extracted.disputes.disputesTable.status_920e413c')}
            </th>
            {viewerTier === 'staff' ? (
              <>
                <th className='px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
                  {t('extracted.disputes.disputesTable.aiDraft_cf76a5a2')}
                </th>
                <th className='px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
                  {t('extracted.disputes.disputesTable.response_9061383b')}
                </th>
                <th className='px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
                  {t('extracted.disputes.disputesTable.actions_ff8059dc')}
                </th>
              </>
            ) : (
              <th className='px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
                {t('extracted.disputes.disputesTable.resolution_d4055faf')}
              </th>
            )}
          </tr>
        </thead>
        <tbody className='divide-y divide-border bg-card'>
          {viewerTier === 'staff'
            ? disputes.map(dispute => (
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
            : disputes.map(dispute => (
                <MemberDisputeRow
                  key={dispute.id}
                  dispute={dispute}
                />
              ))}
        </tbody>
      </table>
    </AdminTableShell>
  )
}
