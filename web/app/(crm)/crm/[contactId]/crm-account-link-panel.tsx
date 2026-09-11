'use client'

import { Button } from '@/components/ui/button'
import { UserAutocomplete } from '@/components/users/user-autocomplete'
import type { WebCrmContact } from '@/types/crm'
import { useTranslations } from '@/lib/i18n/use-translations'

export function CrmAccountLinkPanel({
  contact,
  linkUserId,
  linking,
  onLink,
  onLinkUserIdChange,
  onUnlink,
  unlinking,
}: {
  contact: WebCrmContact
  linkUserId: string
  linking: boolean
  onLink: (e: React.FormEvent) => void
  onLinkUserIdChange: (userId: string) => void
  onUnlink: () => void
  unlinking: boolean
}) {
  const t = useTranslations()
  return (
    <div className='rounded-lg border bg-card p-4'>
      <h2 className='mb-4 text-sm font-medium text-foreground'>
        {t('extracted.contactid.crmAccountLinkPanel.accountLink_34cbb977')}
      </h2>
      {contact.user_id ? (
        <div className='flex items-center gap-4'>
          <p className='text-sm text-foreground'>
            {t('extracted.contactid.crmAccountLinkPanel.linkedToUser_db2b35b9')}{' '}
            <code className='text-xs'>{contact.user_id}</code>
          </p>
          <Button
            variant='outline'
            size='sm'
            onClick={onUnlink}
            loading={unlinking}
            disabled={unlinking}
          >
            {unlinking
              ? t('extracted.contactid.crmAccountLinkPanel.unlinking_eb4e0835')
              : t('extracted.contactid.crmAccountLinkPanel.unlink_b90108da')}
          </Button>
        </div>
      ) : (
        <form
          onSubmit={onLink}
          className='flex gap-3'
        >
          <div className='max-w-xs flex-1'>
            <UserAutocomplete
              label=''
              value={linkUserId}
              onChange={id => onLinkUserIdChange(id)}
              placeholder={t('extracted.contactid.crmAccountLinkPanel.searchUsers_beb0e209')}
              clearOnTextEdit
            />
          </div>
          <Button
            type='submit'
            size='sm'
            loading={linking}
            disabled={linking || !linkUserId.trim()}
          >
            {linking
              ? t('extracted.contactid.crmAccountLinkPanel.linking_e99ee264')
              : t('extracted.contactid.crmAccountLinkPanel.linkAccount_96427b0e')}
          </Button>
        </form>
      )}
    </div>
  )
}
