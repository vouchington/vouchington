'use client'

import { useEffect, useState, type ReactNode } from 'react'
import onError, { onSuccess } from '@/lib/on-error'
import { fetchQueues, pauseQueue, resumeQueue } from '@/lib/api/client/mq'

type QueuePauseCopy = {
  disableLabel: string
  disabledLabel: string
  disabledMessage: string
  enableLabel: string
  enabledLabel: string
  enabledMessage: string
  errorFallback: string
  heading: string
  loadingLabel: string
  retryLabel: string
}

type QueuePauseRetry = {
  label: string
  onClick: () => void
}

type QueuePauseToggle = {
  disabled: boolean
  label: string
  onClick: () => void
  variant: 'default' | 'destructive'
}

function loadQueuePaused(
  queueName: string,
  setPaused: (paused: boolean | null) => void,
  setFetchError: (failed: boolean) => void,
): void {
  fetchQueues()
    .then(({ queues }) => {
      setPaused(queues.find(queue => queue.name === queueName)?.paused ?? null)
    })
    .catch(() => {
      setFetchError(true)
    })
}

function statusLabel(paused: boolean | null, copy: QueuePauseCopy): string {
  if (paused === null) return copy.loadingLabel
  if (paused) return copy.disabledLabel
  return copy.enabledLabel
}

export function QueuePauseSection({
  copy,
  errorForm,
  queueName,
  renderFrame,
  renderRetry,
  renderToggle,
}: {
  copy: QueuePauseCopy
  errorForm: string
  queueName: string
  renderFrame: (children: ReactNode) => ReactNode
  renderRetry: (action: QueuePauseRetry) => ReactNode
  renderToggle: (action: QueuePauseToggle) => ReactNode
}) {
  const [paused, setPaused] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState(false)

  function handleRetry() {
    setFetchError(false)
    setPaused(null)
    loadQueuePaused(queueName, setPaused, setFetchError)
  }

  useEffect(() => {
    loadQueuePaused(queueName, setPaused, setFetchError)
  }, [queueName])

  async function handleToggle() {
    setLoading(true)
    try {
      if (paused) {
        await resumeQueue(queueName)
        setPaused(false)
        onSuccess(copy.enabledMessage)
      } else {
        await pauseQueue(queueName)
        setPaused(true)
        onSuccess(copy.disabledMessage)
      }
    } catch (err) {
      onError(err, {
        fallback: copy.errorFallback,
        tags: { form: errorForm },
      })
    } finally {
      setLoading(false)
    }
  }

  return renderFrame(
    <>
      <h2 className='mb-4 text-xl font-semibold'>{copy.heading}</h2>
      <div className='flex items-center gap-4'>
        {fetchError ? (
          renderRetry({ label: copy.retryLabel, onClick: handleRetry })
        ) : (
          <>
            <span className='text-sm text-muted-foreground'>{statusLabel(paused, copy)}</span>
            {renderToggle({
              disabled: loading || paused === null,
              label: paused ? copy.enableLabel : copy.disableLabel,
              onClick: () => {
                void handleToggle()
              },
              variant: paused ? 'default' : 'destructive',
            })}
          </>
        )}
      </div>
    </>,
  )
}
