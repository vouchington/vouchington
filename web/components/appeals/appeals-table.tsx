'use client'

import { AppealRow } from './appeal-row'
import { MemberAppealRow } from './member-appeal-row'
import { DividedTableShell, type DividedTableColumn } from '@/components/admin/divided-table-shell'
import type { ModerationAppealSummary } from '@/types/appeals'
import { useTranslations } from '@/lib/i18n/use-translations'

interface AppealsTableProps {
  viewerTier: 'staff' | 'member'
  appeals: ModerationAppealSummary[]
  loadingIds: Set<string>
  onOpen: (id: string) => void
}

function appealColumns(
  t: ReturnType<typeof useTranslations>,
  viewerTier: AppealsTableProps['viewerTier'],
): DividedTableColumn[] {
  const shared: DividedTableColumn[] = [
    ['created', t('extracted.appeals.appealsTable.created_d70b9e24')],
    ['target', t('extracted.appeals.appealsTable.target_978354db')],
    ['status', t('extracted.appeals.appealsTable.status_920e413c')],
  ]
  if (viewerTier === 'staff') {
    return [
      ...shared,
      ['ai-draft', t('extracted.appeals.appealsTable.aiDraft_cf76a5a2')],
      ['response', t('extracted.appeals.appealsTable.response_9061383b')],
      ['actions', t('extracted.appeals.appealsTable.actions_ff8059dc')],
    ]
  }
  return [...shared, ['resolution', t('extracted.appeals.appealsTable.resolution_d4055faf')]]
}

export function AppealsTable({ viewerTier, appeals, loadingIds, onOpen }: AppealsTableProps) {
  const t = useTranslations()
  return (
    <DividedTableShell
      aria-label={t('extracted.appeals.page.moderationAppeals_3982fa5d')}
      columns={appealColumns(t, viewerTier)}
      emptyMessage={t('extracted.appeals.appealsTable.noAppeals_ebe16e15')}
      isEmpty={appeals.length === 0}
    >
      {viewerTier === 'staff'
        ? appeals.map(appeal => (
            <AppealRow
              key={appeal.id}
              appeal={appeal}
              disabled={loadingIds.has(appeal.id)}
              onOpen={onOpen}
            />
          ))
        : appeals.map(appeal => (
            <MemberAppealRow
              key={appeal.id}
              appeal={appeal}
            />
          ))}
    </DividedTableShell>
  )
}
