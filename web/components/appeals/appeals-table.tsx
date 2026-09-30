'use client'

import type { ReactNode } from 'react'
import { AppealRow } from './appeal-row'
import { MemberAppealRow } from './member-appeal-row'
import { DividedTableShell, type DividedTableColumn } from '@/components/admin/divided-table-shell'
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

function appealRows({
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
}: AppealsTableProps): ReactNode {
  if (viewerTier === 'staff') {
    return appeals.map(appeal => (
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
  }
  return appeals.map(appeal => (
    <MemberAppealRow
      key={appeal.id}
      appeal={appeal}
    />
  ))
}

export function AppealsTable(props: AppealsTableProps) {
  const t = useTranslations()
  return (
    <DividedTableShell
      aria-label={t('extracted.appeals.page.moderationAppeals_3982fa5d')}
      columns={appealColumns(t, props.viewerTier)}
      emptyMessage={t('extracted.appeals.appealsTable.noAppeals_ebe16e15')}
      isEmpty={props.appeals.length === 0}
    >
      {appealRows(props)}
    </DividedTableShell>
  )
}
