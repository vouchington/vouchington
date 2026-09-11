'use client'

import type { CommunityAgentPrompt } from '@/lib/api/client/community-agent-prompts'
import { CommunityAgentPromptForm } from './community-agent-prompt-form'
import { CommunityAgentPromptItem } from './community-agent-prompt-item'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  prompts: CommunityAgentPrompt[]
  communitySlug: string
}

export function CommunityAgentPromptsPanel({ prompts, communitySlug }: Props) {
  const t = useTranslations()
  return (
    <section
      className='space-y-3'
      data-pw='community-agent-prompts-panel'
    >
      <div>
        <h3 className='text-lg font-semibold'>
          {t('extracted.communities.communityAgentPromptsPanel.agentPrompts_b8a200ed')}
        </h3>
        <p className='text-sm text-muted-foreground'>
          {t(
            'extracted.communities.communityAgentPromptsPanel.manageCustomPromptsForCommunityAi_4ea50293',
          )}
        </p>
      </div>
      <CommunityAgentPromptForm communitySlug={communitySlug} />
      <div
        className='space-y-2'
        data-pw='community-agent-prompt-list'
      >
        {prompts.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('extracted.communities.communityAgentPromptsPanel.noAgentPromptsYet_dd2a8c90')}
          </p>
        ) : (
          prompts.map(prompt => (
            <CommunityAgentPromptItem
              key={`${prompt.id}-${prompt.updated_at}`}
              prompt={prompt}
              communitySlug={communitySlug}
            />
          ))
        )}
      </div>
    </section>
  )
}
