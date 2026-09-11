'use client'

import { useEffect, useState } from 'react'
import onError, { onSuccess } from '@/lib/on-error'
import { Button } from '@/components/ui/button'
import { fetchQueues, pauseQueue, resumeQueue } from '@/lib/api/client/mq'
import { useTranslations } from '@/lib/i18n/use-translations'

const AI_AGENTS_QUEUE = 'ai_agents'

export function AiAgentsSection() {
  const t = useTranslations()
  const [paused, setPaused] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState(false)

  function handleRetry() {
    setFetchError(false)
    setPaused(null)
    fetchQueues()
      .then(({ queues }) => {
        const q = queues.find(queue => queue.name === AI_AGENTS_QUEUE)
        setPaused(q?.paused ?? null)
      })
      .catch(() => {
        setFetchError(true)
      })
  }

  useEffect(() => {
    fetchQueues()
      .then(({ queues }) => {
        const q = queues.find(queue => queue.name === AI_AGENTS_QUEUE)
        setPaused(q?.paused ?? null)
      })
      .catch(() => {
        setFetchError(true)
      })
  }, [])

  async function handleToggle() {
    setLoading(true)
    try {
      if (paused) {
        await resumeQueue(AI_AGENTS_QUEUE)
        setPaused(false)
        onSuccess(t('extracted.queues.aiAgentsSection.aiAgentsEnabled_786b4c72'))
      } else {
        await pauseQueue(AI_AGENTS_QUEUE)
        setPaused(true)
        onSuccess(t('extracted.queues.aiAgentsSection.aiAgentsDisabled_2a397abe'))
      }
    } catch (error) {
      onError(error, {
        fallback: t('extracted.queues.aiAgentsSection.failedToToggleAiAgents_90820208'),
        tags: { form: 'admin-ai-agents-toggle' },
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className='mt-8'
      data-pw='ai-agents-section'
    >
      <h2 className='mb-4 text-xl font-semibold'>
        {t('extracted.queues.aiAgentsSection.aiAgents_d591a7cb')}
      </h2>
      <div className='flex items-center gap-4'>
        {fetchError ? (
          <Button
            data-pw='ai-agents-retry'
            onClick={handleRetry}
            variant='outline'
          >
            {t('extracted.queues.aiAgentsSection.retryLoadingStatus_50b07fb2')}
          </Button>
        ) : (
          <>
            <span className='text-sm text-muted-foreground'>
              {paused === null
                ? t('extracted.queues.aiAgentsSection.loading_8c3f5a92')
                : paused
                  ? t('extracted.queues.aiAgentsSection.disabled_75081b59')
                  : t('extracted.queues.aiAgentsSection.enabled_92c1cdfd')}
            </span>
            <Button
              data-pw='ai-agents-toggle'
              disabled={loading || paused === null}
              onClick={handleToggle}
              variant={paused ? 'default' : 'destructive'}
            >
              {paused
                ? t('extracted.queues.aiAgentsSection.enableAiAgents_4a7c9e13')
                : t('extracted.queues.aiAgentsSection.disableAiAgents_2d8b6f04')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
