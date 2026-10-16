'use client'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type { QueueDomain } from '@/lib/api/client/mq'

export type DomainAction = 'pause' | 'resume' | 'retry-failed'

type DomainActionLabels = { pause: string; resume: string; retryFailed: string }

export function DomainActions({
  busy,
  domain,
  labels,
  onAction,
}: {
  busy: boolean
  domain: QueueDomain
  labels: DomainActionLabels
  onAction: (domain: QueueDomain, action: DomainAction) => void
}) {
  return (
    <div className='flex gap-2'>
      {domain.paused ? (
        <Button
          data-pw='queue-domain-resume'
          size='touchSm'
          disabled={busy}
          onClick={() => onAction(domain, 'resume')}
        >
          {labels.resume}
        </Button>
      ) : (
        <Button
          data-pw='queue-domain-pause'
          size='touchSm'
          variant='destructive'
          disabled={busy}
          onClick={() => onAction(domain, 'pause')}
        >
          {labels.pause}
        </Button>
      )}
      <Button
        data-pw='queue-domain-retry-failed'
        size='touchSm'
        variant='outline'
        disabled={busy}
        onClick={() => onAction(domain, 'retry-failed')}
      >
        {busy ? (
          <Spinner
            className='size-3'
            aria-hidden
          />
        ) : null}
        {labels.retryFailed}
      </Button>
    </div>
  )
}
