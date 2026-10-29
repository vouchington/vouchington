'use client'

import { Button } from '@/components/ui/button'
import {
  replayCopyrightActionIntent,
  replayCopyrightDeliveryIntent,
} from '@/lib/api/client/copyright-notices'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import type { SubmitRecovery } from './copyright-staff-review-buttons'

export function CopyrightStaffIntentRecovery({
  notice,
  pending,
  submitRecovery,
}: {
  notice: CopyrightStaffQueueItem
  pending: boolean
  submitRecovery: SubmitRecovery
}) {
  const failedActions = notice.action_intents.filter(intent => intent.state === 'failed')
  const failedDeliveries = notice.delivery_intents.filter(intent => intent.state === 'failed')
  const bouncedDeliveries = notice.delivery_intents.filter(intent => intent.state === 'bounced')
  if (failedActions.length + failedDeliveries.length + bouncedDeliveries.length === 0) return null
  return (
    <section className='space-y-2'>
      <h3 className='font-medium'>Delivery failures</h3>
      {failedActions.map(intent => {
        const target = notice.targets.find(target => target.id === intent.target_id)
        return (
          <RecoveryRow
            key={intent.id}
            pending={pending}
            retry={() => replayCopyrightActionIntent(notice.id, intent.id)}
            success='Media action queued again.'
            submitRecovery={submitRecovery}
          >
            Media {intent.action} failed
            {intent.failure_message ? `: ${intent.failure_message}` : ''}.{' '}
            {target ? (
              <a
                href={target.hosted_use_url}
                target='_blank'
                rel='noopener noreferrer'
                className='underline'
              >
                {target.hosted_use_url}
              </a>
            ) : (
              'Original hosted use unavailable.'
            )}
          </RecoveryRow>
        )
      })}
      {failedDeliveries.map(intent => (
        <RecoveryRow
          key={intent.id}
          pending={pending}
          retry={() => replayCopyrightDeliveryIntent(notice.id, intent.id)}
          success='Notice delivery queued again.'
          submitRecovery={submitRecovery}
        >
          {intent.channel} {intent.delivery_kind} failed after {intent.delivery_attempt_count}{' '}
          attempts
        </RecoveryRow>
      ))}
      {bouncedDeliveries.map(intent => (
        <p
          className='text-sm text-destructive'
          key={intent.id}
        >
          {intent.channel} {intent.delivery_kind} bounced. Verify the recipient before another
          contact.
        </p>
      ))}
    </section>
  )
}

function RecoveryRow({
  children,
  pending,
  retry,
  submitRecovery,
  success,
}: {
  children: React.ReactNode
  pending: boolean
  retry: () => Promise<unknown>
  submitRecovery: SubmitRecovery
  success: string
}) {
  return (
    <div className='flex items-center justify-between gap-2 text-sm'>
      <span>{children}</span>
      <Button
        data-pw='copyright-staff-case-detail-retry'
        disabled={pending}
        onClick={() => submitRecovery(retry, success)}
      >
        Retry
      </Button>
    </div>
  )
}
