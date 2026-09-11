'use client'

import type { CommunityAgentPrompt } from '@/lib/api/client/community-agent-prompts'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  prompt: CommunityAgentPrompt
}

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function CommunityAgentPromptStatus({ prompt }: Props) {
  const t = useTranslations()
  return (
    <p className='text-xs text-muted-foreground'>
      {prompt.slot_allocated ? (
        <span className='font-medium text-green-600'>
          {t('extracted.communities.communityAgentPromptStatus.slotAllocated_417c6c1d')}
        </span>
      ) : (
        <span>{t('extracted.communities.communityAgentPromptStatus.noSlot_1a554a06')}</span>
      )}
      {prompt.activated_at ? (
        <>
          {' '}
          · {t('extracted.communities.communityAgentPromptStatus.activeSince_e6c81b69')}{' '}
          <time suppressHydrationWarning>{DATE_FORMAT.format(new Date(prompt.activated_at))}</time>
        </>
      ) : null}
      {prompt.deactivated_at ? (
        <>
          {' '}
          · {t('extracted.communities.communityAgentPromptStatus.deactivated_4840a572')}{' '}
          <time suppressHydrationWarning>
            {DATE_FORMAT.format(new Date(prompt.deactivated_at))}
          </time>
        </>
      ) : null}
    </p>
  )
}
