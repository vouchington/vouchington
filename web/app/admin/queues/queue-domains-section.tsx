'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import onError, { onSuccess } from '@/lib/on-error'
import {
  fetchQueueDomains,
  pauseQueueDomain,
  resumeQueueDomain,
  retryFailedDomainJobs,
  type QueueDomain,
} from '@/lib/api/client/mq'
import { useTranslations } from '@/lib/i18n/use-translations'
import { BACKGROUND_QUEUE } from './domains-model'
import type { DomainAction } from './domain-actions'
import { notifyDomainsChanged, useDomainsVersion } from './domains-sync'
import { DomainsTable, type DomainsTableLabels } from './domains-table'

type Translate = ReturnType<typeof useTranslations>

function tableLabels(t: Translate): DomainsTableLabels {
  return {
    action: t('extracted.queues.domainsSection.action_64cff131'),
    counts: {
      active: t('extracted.queues.domainsSection.active_92340695'),
      completed: t('extracted.queues.domainsSection.completed_22a970d2'),
      delayed: t('extracted.queues.domainsSection.delayed_a5c19c9f'),
      failed: t('extracted.queues.domainsSection.failed_031a8f0f'),
      waiting: t('extracted.queues.domainsSection.waiting_6e293a8c'),
    },
    domain: t('extracted.queues.domainsSection.domain_79fa3361'),
    heading: t('extracted.queues.domainsSection.backgroundDomains_d956d6be'),
    pause: t('extracted.queues.domainsSection.pause_858e4ba7'),
    paused: reason =>
      reason === null
        ? t('extracted.queues.domainsSection.paused_e159b061')
        : t('extracted.queues.domainsSection.pausedReason_41440167', { reason }),
    resume: t('extracted.queues.domainsSection.resume_d640c742'),
    retryFailed: t('extracted.queues.domainsSection.retryFailed_2630f650'),
    running: t('extracted.queues.domainsSection.running_f4ccae29'),
    status: t('extracted.queues.domainsSection.status_920e413c'),
  }
}

async function performAction(t: Translate, domain: string, action: DomainAction): Promise<void> {
  if (action === 'pause') {
    await pauseQueueDomain(BACKGROUND_QUEUE, domain)
    onSuccess(t('extracted.queues.domainsSection.domainPaused_d260d9cc', { domain }))
  } else if (action === 'resume') {
    await resumeQueueDomain(BACKGROUND_QUEUE, domain)
    onSuccess(t('extracted.queues.domainsSection.domainResumed_39b734e9', { domain }))
  } else {
    const { retried } = await retryFailedDomainJobs(BACKGROUND_QUEUE, domain)
    onSuccess(
      t('extracted.queues.domainsSection.failedJobsRetriedInDomainCount_ae950e8e', {
        count: retried,
        domain,
      }),
    )
  }
}

function failureMessage(t: Translate, domain: string, action: DomainAction): string {
  if (action === 'pause')
    return t('extracted.queues.domainsSection.failedToPauseDomain_59e8d51f', { domain })
  if (action === 'resume')
    return t('extracted.queues.domainsSection.failedToResumeDomain_1d8cd236', { domain })
  return t('extracted.queues.domainsSection.failedToRetryDomain_b8ac9e18', { domain })
}

/** Returns a cancel function; a cancelled load is stale and never writes state. */
function loadDomains(
  setDomains: (domains: QueueDomain[]) => void,
  setFetchError: (failed: boolean) => void,
): () => void {
  let stale = false
  fetchQueueDomains(BACKGROUND_QUEUE)
    .then(({ domains }) => {
      if (stale) return
      setDomains(domains)
      setFetchError(false)
    })
    .catch(() => {
      if (!stale) setFetchError(true)
    })
  return () => {
    stale = true
  }
}

export function QueueDomainsSection() {
  const t = useTranslations()
  const [domains, setDomains] = useState<QueueDomain[] | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  const [retries, setRetries] = useState(0)

  const domainsVersion = useDomainsVersion()
  useEffect(() => {
    return loadDomains(setDomains, setFetchError)
  }, [domainsVersion, retries])

  function handleRetryLoad() {
    setFetchError(false)
    setDomains(null)
    setRetries(count => count + 1)
  }

  async function handleAction(domain: string, action: DomainAction) {
    setBusy(current => ({ ...current, [domain]: true }))
    try {
      await performAction(t, domain, action)
    } catch (err) {
      onError(err, {
        fallback: failureMessage(t, domain, action),
        tags: { form: `admin-queue-domain-${action}` },
      })
    }
    // Reloads this table and any other control of the same domains.
    notifyDomainsChanged()
    setBusy(current => ({ ...current, [domain]: false }))
  }

  return (
    <div
      className='mt-8'
      data-pw='queue-domains-section'
    >
      {fetchError ? (
        <div className='flex items-center gap-4'>
          <span className='text-sm text-muted-foreground'>
            {t('extracted.queues.domainsSection.failedToLoadBackgroundDomains_15ec8b34')}
          </span>
          <Button
            data-pw='queue-domains-retry'
            onClick={handleRetryLoad}
            variant='outline'
          >
            {t('extracted.queues.domainsSection.retry_942087cc')}
          </Button>
        </div>
      ) : domains === null ? (
        <span className='text-sm text-muted-foreground'>
          {t('extracted.queues.domainsSection.loading_ba3bbbe1')}
        </span>
      ) : (
        <DomainsTable
          busy={busy}
          domains={domains}
          labels={tableLabels(t)}
          onAction={(domain, action) => {
            void handleAction(domain.domain, action)
          }}
        />
      )}
    </div>
  )
}
