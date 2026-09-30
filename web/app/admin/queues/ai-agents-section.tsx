'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'
import { QueuePauseSection } from './queue-pause-section'

const AI_AGENTS_QUEUE = 'ai_agents'

function aiAgentsCopy(t: ReturnType<typeof useTranslations>) {
  return {
    disableLabel: t('extracted.queues.aiAgentsSection.disableAiAgents_2d8b6f04'),
    disabledLabel: t('extracted.queues.aiAgentsSection.disabled_75081b59'),
    disabledMessage: t('extracted.queues.aiAgentsSection.aiAgentsDisabled_2a397abe'),
    enableLabel: t('extracted.queues.aiAgentsSection.enableAiAgents_4a7c9e13'),
    enabledLabel: t('extracted.queues.aiAgentsSection.enabled_92c1cdfd'),
    enabledMessage: t('extracted.queues.aiAgentsSection.aiAgentsEnabled_786b4c72'),
    errorFallback: t('extracted.queues.aiAgentsSection.failedToToggleAiAgents_90820208'),
    heading: t('extracted.queues.aiAgentsSection.aiAgents_d591a7cb'),
    loadingLabel: t('extracted.queues.aiAgentsSection.loading_8c3f5a92'),
    retryLabel: t('extracted.queues.aiAgentsSection.retryLoadingStatus_50b07fb2'),
  }
}

function renderAiAgentsFrame(children: ReactNode) {
  return (
    <div
      className='mt-8'
      data-pw='ai-agents-section'
    >
      {children}
    </div>
  )
}

function renderAiAgentsRetry({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      data-pw='ai-agents-retry'
      onClick={onClick}
      variant='outline'
    >
      {label}
    </Button>
  )
}

function renderAiAgentsToggle({
  disabled,
  label,
  onClick,
  variant,
}: {
  disabled: boolean
  label: string
  onClick: () => void
  variant: 'default' | 'destructive'
}) {
  return (
    <Button
      data-pw='ai-agents-toggle'
      disabled={disabled}
      onClick={onClick}
      variant={variant}
    >
      {label}
    </Button>
  )
}

export function AiAgentsSection() {
  const t = useTranslations()
  return (
    <QueuePauseSection
      copy={aiAgentsCopy(t)}
      errorForm='admin-ai-agents-toggle'
      queueName={AI_AGENTS_QUEUE}
      renderFrame={renderAiAgentsFrame}
      renderRetry={renderAiAgentsRetry}
      renderToggle={renderAiAgentsToggle}
    />
  )
}
