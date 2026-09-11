'use client'

import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { disableCommunityAiAgent, enableCommunityAiAgent } from '@/lib/api/client'
import onError, { onSuccess } from '@/lib/on-error'
import type { CommunityAiAgent } from '@/types/api-responses'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useTranslations } from '@/lib/i18n/use-translations'

interface CommunityAiAgentsPanelProps {
  agents: CommunityAiAgent[]
  communitySlug: string
}

export function CommunityAiAgentsPanel({ agents, communitySlug }: CommunityAiAgentsPanelProps) {
  const t = useTranslations()
  const router = useRouter()
  const [updatesBySlug, setUpdatesBySlug] = useState<Record<string, CommunityAiAgent>>({})
  const [pendingSlug, setPendingSlug] = useState<string | null>(null)
  const [isRefreshing, startRefreshing] = useTransition()
  const items = agents.map(agent => updatesBySlug[agent.slug] ?? agent)

  async function toggleAgent(agent: CommunityAiAgent, enabled: boolean) {
    if (pendingSlug || isRefreshing) return
    setPendingSlug(agent.slug)
    try {
      const response = enabled
        ? await enableCommunityAiAgent(communitySlug, agent.slug)
        : await disableCommunityAiAgent(communitySlug, agent.slug)
      setUpdatesBySlug(current => ({
        ...current,
        [response.community_ai_agent.slug]: response.community_ai_agent,
      }))
      onSuccess(
        enabled
          ? t('extracted.communities.communityAiAgentsPanel.nameEnabled_52997ef0', {
              name: formatAgentName(agent.slug),
            })
          : t('extracted.communities.communityAiAgentsPanel.nameDisabled_79e3c2ff', {
              name: formatAgentName(agent.slug),
            }),
      )
      startRefreshing(() => router.refresh())
    } catch (error) {
      onError(error, {
        fallback: t(
          'extracted.communities.communityAiAgentsPanel.failedToUpdateCommunityAiAgent_e8326c8a',
        ),
      })
    } finally {
      setPendingSlug(null)
    }
  }

  return (
    <section
      className='space-y-3'
      data-pw='community-ai-agents-panel'
    >
      <div>
        <h3 className='text-lg font-semibold'>
          {t('extracted.communities.communityAiAgentsPanel.aiAgents_d591a7cb')}
        </h3>
        <p className='text-sm text-muted-foreground'>
          {t(
            'extracted.communities.communityAiAgentsPanel.enableGlobalLabelAgentsForPosts_e5de7694',
          )}
        </p>
      </div>
      <div className='overflow-hidden rounded-md border'>
        {items.map(agent => {
          const switchId = `community-ai-agent-${agent.slug}`
          const disabled = pendingSlug !== null || isRefreshing || !agent.entitlement.allowed
          return (
            <Label
              key={agent.slug}
              htmlFor={switchId}
              className='flex min-h-16 cursor-pointer items-start justify-between gap-4 border-b p-4 last:border-b-0'
              data-pw='community-ai-agent-row'
            >
              <span className='min-w-0 space-y-1'>
                <span className='block font-medium'>{formatAgentName(agent.slug)}</span>
                <span className='block text-xs text-muted-foreground'>
                  @{agent.system_username} · {formatAction(agent.on_flag_action, t)}
                </span>
                <span className='flex flex-wrap gap-1'>
                  {agent.always_on ? (
                    <Badge
                      variant='secondary'
                      data-pw='community-ai-agent-always-on-badge'
                    >
                      {t('extracted.communities.communityAiAgentsPanel.alwaysOn_044ba8a9')}
                    </Badge>
                  ) : null}
                  {agent.label_topic_slugs.map(slug => (
                    <Badge
                      key={slug}
                      variant='outline'
                    >
                      #{slug}
                    </Badge>
                  ))}
                </span>
                {!agent.entitlement.allowed && agent.entitlement.reason ? (
                  <span
                    className='block text-xs text-muted-foreground'
                    data-pw='community-ai-agent-entitlement-reason'
                  >
                    {agent.entitlement.reason}
                  </span>
                ) : null}
              </span>
              <Switch
                id={switchId}
                checked={agent.enabled}
                disabled={disabled}
                data-agent-slug={agent.slug}
                data-pw='community-ai-agent-toggle'
                onCheckedChange={checked => toggleAgent(agent, checked)}
              />
            </Label>
          )
        })}
      </div>
    </section>
  )
}

function formatAgentName(slug: string): string {
  return slug
    .split('-')
    .map(part => (part === 'ai' ? 'AI' : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ')
}

function formatAction(
  action: CommunityAiAgent['on_flag_action'],
  t: ReturnType<typeof useTranslations>,
): string {
  return action === 'review_queue'
    ? t('extracted.communities.communityAiAgentsPanel.tagsAndMovesToReview_72e046d5')
    : t('extracted.communities.communityAiAgentsPanel.tagsOnly_822f5607')
}
