'use client'

import type { CommunityAgentPrompt } from '@/lib/api/client/community-agent-prompts'
import { formatUtcDateTime } from '@ts-shared/utils/format'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  prompt: CommunityAgentPrompt
}

export function CommunityAgentPromptStatus({ prompt }: Props) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  return (
    <p className='text-xs text-muted-foreground'>
      {prompt.is_slot_allocated ? (
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
          <time>{formatUtcDateTime(prompt.activated_at, uiLocale)}</time>
        </>
      ) : null}
      {prompt.deactivated_at ? (
        <>
          {' '}
          · {t('extracted.communities.communityAgentPromptStatus.deactivated_4840a572')}{' '}
          <time>{formatUtcDateTime(prompt.deactivated_at, uiLocale)}</time>
        </>
      ) : null}
    </p>
  )
}
