'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import onError, { onSuccess } from '@/lib/on-error'
import {
  fetchQueueDomains,
  fetchQueues,
  pauseQueue,
  pauseQueueDomain,
  resumeQueue,
  resumeQueueDomain,
} from '@/lib/api/client/mq'
import { notifyDomainsChanged, useDomainsVersion } from './domains-sync'

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

/** A whole queue, or one domain of a shared queue such as `background`. */
type QueuePauseTarget = { queueName: string; domain?: string }

/** Returns a cancel function; a cancelled load is stale and never writes state. */
function loadQueuePaused(
  { queueName, domain }: QueuePauseTarget,
  setPaused: (paused: boolean | null) => void,
  setFetchError: (failed: boolean) => void,
): () => void {
  let stale = false
  const load =
    domain === undefined
      ? fetchQueues().then(
          ({ queues }) => queues.find(queue => queue.name === queueName)?.paused ?? null,
        )
      : fetchQueueDomains(queueName).then(
          ({ domains }) => domains.find(entry => entry.domain === domain)?.paused ?? null,
        )
  load
    .then(value => {
      if (stale) return
      setPaused(value)
      setFetchError(false)
    })
    .catch(() => {
      if (!stale) setFetchError(true)
    })
  return () => {
    stale = true
  }
}

function pauseTarget({ queueName, domain }: QueuePauseTarget) {
  return domain === undefined ? pauseQueue(queueName) : pauseQueueDomain(queueName, domain)
}

function resumeTarget({ queueName, domain }: QueuePauseTarget) {
  return domain === undefined ? resumeQueue(queueName) : resumeQueueDomain(queueName, domain)
}

function statusLabel(paused: boolean | null, copy: QueuePauseCopy): string {
  if (paused === null) return copy.loadingLabel
  if (paused) return copy.disabledLabel
  return copy.enabledLabel
}

export function QueuePauseSection({
  copy,
  domain,
  errorForm,
  queueName,
  renderFrame,
  renderRetry,
  renderToggle,
}: {
  copy: QueuePauseCopy
  /** Pauses only this domain of `queueName` instead of the whole queue. */
  domain?: string
  errorForm: string
  queueName: string
  renderFrame: (children: ReactNode) => ReactNode
  renderRetry: (action: QueuePauseRetry) => ReactNode
  renderToggle: (action: QueuePauseToggle) => ReactNode
}) {
  const target = useMemo<QueuePauseTarget>(
    () => (domain === undefined ? { queueName } : { queueName, domain }),
    [queueName, domain],
  )
  const [paused, setPaused] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState(false)
  const [retries, setRetries] = useState(0)

  function handleRetry() {
    setFetchError(false)
    setPaused(null)
    setRetries(count => count + 1)
  }

  const domainsVersion = useDomainsVersion()
  useEffect(() => {
    return loadQueuePaused(target, setPaused, setFetchError)
  }, [target, domainsVersion, retries])

  async function handleToggle() {
    setLoading(true)
    try {
      if (paused) {
        await resumeTarget(target)
        setPaused(false)
        onSuccess(copy.enabledMessage)
      } else {
        await pauseTarget(target)
        setPaused(true)
        onSuccess(copy.disabledMessage)
      }
      if (target.domain !== undefined) notifyDomainsChanged()
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
