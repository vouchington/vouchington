'use client'

import { useMemo, useState } from 'react'
import { PaginatedListFooter } from '@/components/shared/paginated-list-footer'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import type { CommunityAgentPromptsResponseBody } from '@/types/api-responses'
import {
  fetchCommunityAgentPrompts,
  type CommunityAgentPrompt,
} from '@/lib/api/client/community-agent-prompts'
import { CommunityAgentPromptForm } from './community-agent-prompt-form'
import { CommunityAgentPromptItem } from './community-agent-prompt-item'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  prompts: CommunityAgentPrompt[]
  pageInfo: CommunityAgentPromptsResponseBody['page_info']
  communitySlug: string
  onPromptUpdated?: (prompt: CommunityAgentPrompt | null, promptId: string) => void
  onPromptCreated?: (prompt: CommunityAgentPrompt) => void
}

export function CommunityAgentPromptsPanel({
  prompts,
  pageInfo,
  communitySlug,
  onPromptUpdated,
  onPromptCreated,
}: Props) {
  const t = useTranslations()
  const initialPage = useMemo(
    () => ({ community_agent_prompts: prompts, page_info: pageInfo }),
    [prompts, pageInfo],
  )
  const [edits, setEdits] = useState<Record<string, CommunityAgentPrompt | null>>({})
  const { pages, hasNextPage, loadingMore, fetchError, clearError, loadMore } = usePaginatedList(
    initialPage,
    `/api/v1/communities/${encodeURIComponent(communitySlug)}/agent-prompts`,
    {},
    { loadPage: after => fetchCommunityAgentPrompts(communitySlug, { after }) },
  )
  const byId = new Map<string, CommunityAgentPrompt>()
  for (const page of pages) {
    for (const prompt of page.community_agent_prompts) {
      if (!byId.has(prompt.id)) byId.set(prompt.id, prompt)
    }
  }
  for (const [id, updated] of Object.entries(edits)) {
    if (updated) byId.set(id, updated)
    else byId.delete(id)
  }
  const visiblePrompts = [...byId.values()]
  function updatePrompt(updated: CommunityAgentPrompt | null, promptId: string) {
    setEdits(previous => ({ ...previous, [promptId]: updated }))
    onPromptUpdated?.(updated, promptId)
  }
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
      <CommunityAgentPromptForm
        communitySlug={communitySlug}
        onPromptCreated={created => {
          setEdits(previous => ({ ...previous, [created.id]: created }))
          onPromptCreated?.(created)
        }}
      />
      <div
        className='space-y-2'
        data-pw='community-agent-prompt-list'
      >
        {visiblePrompts.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('extracted.communities.communityAgentPromptsPanel.noAgentPromptsYet_dd2a8c90')}
          </p>
        ) : (
          visiblePrompts.map(prompt => (
            <CommunityAgentPromptItem
              key={`${prompt.id}-${prompt.updated_at}`}
              prompt={prompt}
              communitySlug={communitySlug}
              onPromptUpdated={updated => updatePrompt(updated, prompt.id)}
            />
          ))
        )}
      </div>
      <PaginatedListFooter
        fetchError={fetchError}
        canLoadMore={hasNextPage}
        loadingMore={loadingMore}
        clearError={clearError}
        loadMore={() => {
          void loadMore()
        }}
      />
    </section>
  )
}
