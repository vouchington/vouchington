'use client'

import { AppealRow } from './appeal-row'
import { MemberAppealRow } from './member-appeal-row'
import { AdminTableShell } from '@/components/admin/admin-table-shell'
import type {
  ModerationAppeal,
  ModerationAppealAction,
  ModerationAppealViewerRole,
} from '@/types/appeals'
import { useTranslations } from '@/lib/i18n/use-translations'

interface AppealsTableProps {
  viewerTier: 'staff' | 'member'
  viewerRole?: ModerationAppealViewerRole
  appeals: ModerationAppeal[]
  draftEdits: Record<string, string>
  loadingIds: Set<string>
  onEdit: (id: string, text: string) => void
  onApprove: (id: string) => void
  onSend: (id: string) => void
  onRerunAI: (id: string) => void
  onResolve: (id: string, action: ModerationAppealAction) => void
}

export function AppealsTable({
  viewerTier,
  viewerRole = 'member',
  appeals,
  draftEdits,
  loadingIds,
  onEdit,
  onApprove,
  onSend,
  onRerunAI,
  onResolve,
}: AppealsTableProps) {
  const t = useTranslations()
  const isEmpty = appeals.length === 0

  return (
    <AdminTableShell
      aria-label={t('extracted.appeals.page.moderationAppeals_3982fa5d')}
      isEmpty={isEmpty}
      emptyMessage={t('extracted.appeals.appealsTable.noAppeals_ebe16e15')}
    >
      <table className='min-w-full divide-y divide-border'>
        <thead className='bg-muted/50'>
          <tr>
            <th className='px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
              {t('extracted.appeals.appealsTable.created_d70b9e24')}
            </th>
            <th className='px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
              {t('extracted.appeals.appealsTable.target_978354db')}
            </th>
            <th className='px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
              {t('extracted.appeals.appealsTable.status_920e413c')}
            </th>
            {viewerTier === 'staff' ? (
              <>
                <th className='px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
                  {t('extracted.appeals.appealsTable.aiDraft_cf76a5a2')}
                </th>
                <th className='px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
                  {t('extracted.appeals.appealsTable.response_9061383b')}
                </th>
                <th className='px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
                  {t('extracted.appeals.appealsTable.actions_ff8059dc')}
                </th>
              </>
            ) : (
              <th className='px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
                {t('extracted.appeals.appealsTable.resolution_d4055faf')}
              </th>
            )}
          </tr>
        </thead>
        <tbody className='divide-y divide-border bg-card'>
          {viewerTier === 'staff'
            ? appeals.map(appeal => (
                <AppealRow
                  key={appeal.id}
                  appeal={{
                    ...appeal,
                    public_response: draftEdits[appeal.id] ?? appeal.public_response,
                  }}
                  viewerRole={viewerRole}
                  disabled={loadingIds.has(appeal.id)}
                  onEdit={onEdit}
                  onApprove={onApprove}
                  onSend={onSend}
                  onRerunAI={onRerunAI}
                  onResolve={onResolve}
                />
              ))
            : appeals.map(appeal => (
                <MemberAppealRow
                  key={appeal.id}
                  appeal={appeal}
                />
              ))}
        </tbody>
      </table>
    </AdminTableShell>
  )
}
