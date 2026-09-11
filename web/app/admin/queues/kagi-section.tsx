'use client'

import { useEffect, useState } from 'react'
import onError, { onSuccess } from '@/lib/on-error'
import { Button } from '@/components/ui/button'
import { fetchQueues, pauseQueue, resumeQueue } from '@/lib/api/client/mq'
import { useTranslations } from '@/lib/i18n/use-translations'

const KAGI_SMALLWEB_QUEUE = 'kagi-smallweb'

export function KagiSection() {
  const t = useTranslations()
  const [paused, setPaused] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState(false)

  function handleRetry() {
    setFetchError(false)
    setPaused(null)
    fetchQueues()
      .then(({ queues }) => {
        const q = queues.find(queue => queue.name === KAGI_SMALLWEB_QUEUE)
        setPaused(q?.paused ?? null)
      })
      .catch(() => {
        setFetchError(true)
      })
  }

  useEffect(() => {
    fetchQueues()
      .then(({ queues }) => {
        const q = queues.find(queue => queue.name === KAGI_SMALLWEB_QUEUE)
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
        await resumeQueue(KAGI_SMALLWEB_QUEUE)
        setPaused(false)
        onSuccess(t('extracted.queues.kagiSection.kagiSmallwebEnabled_96f7a415'))
      } else {
        await pauseQueue(KAGI_SMALLWEB_QUEUE)
        setPaused(true)
        onSuccess(t('extracted.queues.kagiSection.kagiSmallwebDisabled_690e9de0'))
      }
    } catch (error) {
      onError(error, {
        fallback: t('extracted.queues.kagiSection.failedToToggleKagiSmallweb_57905ab3'),
        tags: { form: 'admin-kagi-smallweb-toggle' },
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className='mt-8'
      data-pw='kagi-section'
    >
      <h2 className='mb-4 text-xl font-semibold'>
        {t('extracted.queues.kagiSection.kagiSmallweb_fb55419b')}
      </h2>
      <div className='flex items-center gap-4'>
        {fetchError ? (
          <Button
            data-pw='kagi-retry'
            onClick={handleRetry}
            variant='outline'
          >
            {t('extracted.queues.kagiSection.retryLoadingStatus_50b07fb2')}
          </Button>
        ) : (
          <>
            <span className='text-sm text-muted-foreground'>
              {paused === null
                ? t('extracted.queues.kagiSection.loading_ba3bbbe1')
                : paused
                  ? t('extracted.queues.kagiSection.disabled_75081b59')
                  : t('extracted.queues.kagiSection.enabled_92c1cdfd')}
            </span>
            <Button
              data-pw='kagi-toggle'
              disabled={loading || paused === null}
              onClick={handleToggle}
              variant={paused ? 'default' : 'destructive'}
            >
              {paused
                ? t('extracted.queues.kagiSection.enableKagiSmallweb_9708f935')
                : t('extracted.queues.kagiSection.disableKagiSmallweb_4074794b')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
