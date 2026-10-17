'use client'

import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'

interface InviteCodeNoticeProps {
  code: string
  onDismiss: () => void
}

export function InviteCodeNotice({ code, onDismiss }: InviteCodeNoticeProps) {
  const t = useTranslations()
  return (
    <div className='mb-4 rounded-md border bg-muted p-3'>
      <p className='text-sm'>{t('extracted.communities.inviteManager.oneTimeCodeNotice')}</p>
      <p className='mt-2 font-mono text-sm'>{code}</p>
      <Button
        type='button'
        variant='ghost'
        size='sm'
        className='mt-2'
        onClick={onDismiss}
      >
        {t('extracted.communities.communityAutomodFlagsPanel.dismiss_48845bff')}
      </Button>
    </div>
  )
}
