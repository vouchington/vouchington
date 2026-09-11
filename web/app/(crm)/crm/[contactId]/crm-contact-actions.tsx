'use client'

import { Button } from '@/components/ui/button'
import { CrmAiDraftDialog } from './crm-ai-draft-dialog'
import { CrmEmailComposeDialog } from './crm-email-compose-dialog'
import { CrmContactStatusBadge } from './crm-contact-status-badge'
import type { CrmContactStatus, WebCrmMessage } from '@/types/crm'
import { useTranslations } from '@/lib/i18n/use-translations'

export function CrmContactActions({
  archiving,
  confirmArchive,
  contactId,
  editing,
  onArchive,
  onConfirmArchiveChange,
  onEditingChange,
  onEmailSent,
  status,
}: {
  archiving: boolean
  confirmArchive: boolean
  contactId: string
  editing: boolean
  onArchive: () => void
  onConfirmArchiveChange: (confirm: boolean) => void
  onEditingChange: (editing: boolean) => void
  onEmailSent: (message: WebCrmMessage) => void
  status: CrmContactStatus
}) {
  const t = useTranslations()
  return (
    <div className='flex flex-wrap items-center gap-3'>
      <CrmContactStatusBadge status={status} />
      <div className='ml-auto flex gap-3'>
        <CrmAiDraftDialog
          contactId={contactId}
          onSent={onEmailSent}
        />
        <CrmEmailComposeDialog
          contactId={contactId}
          onSent={onEmailSent}
        />
        {!editing && (
          <Button
            variant='outline'
            size='sm'
            onClick={() => onEditingChange(true)}
          >
            {t('extracted.contactid.crmContactActions.edit_464c4ffd')}
          </Button>
        )}
        <ArchiveButtons
          archiving={archiving}
          confirmArchive={confirmArchive}
          onArchive={onArchive}
          onConfirmArchiveChange={onConfirmArchiveChange}
        />
      </div>
    </div>
  )
}

function ArchiveButtons({
  archiving,
  confirmArchive,
  onArchive,
  onConfirmArchiveChange,
}: {
  archiving: boolean
  confirmArchive: boolean
  onArchive: () => void
  onConfirmArchiveChange: (confirm: boolean) => void
}) {
  const t = useTranslations()
  if (!confirmArchive) {
    return (
      <Button
        variant='destructive'
        size='sm'
        onClick={onArchive}
      >
        {t('extracted.contactid.crmContactActions.archive_66f4804e')}
      </Button>
    )
  }
  return (
    <>
      <Button
        variant='destructive'
        size='sm'
        onClick={onArchive}
        loading={archiving}
        disabled={archiving}
      >
        {archiving
          ? t('extracted.contactid.crmContactActions.archiving_6f340711')
          : t('extracted.contactid.crmContactActions.confirmArchive_03401b9d')}
      </Button>
      <Button
        variant='outline'
        size='sm'
        onClick={() => onConfirmArchiveChange(false)}
      >
        {t('extracted.contactid.crmContactActions.cancel_19766ed6')}
      </Button>
    </>
  )
}
