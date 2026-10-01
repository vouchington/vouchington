import { Badge } from '@/components/ui/badge'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'

type DeliveryState = CopyrightStaffQueueItem['delivery_intents'][number]['state']

const states: Record<
  DeliveryState,
  { label: string; variant: 'outline' | 'secondary' | 'destructive'; note?: string }
> = {
  pending: { label: 'Queued', variant: 'outline' },
  claimed: { label: 'Queued', variant: 'outline' },
  sent: { label: 'Sent', variant: 'secondary' },
  failed: {
    label: 'Failed',
    variant: 'destructive',
    note: 'The claimant has not been reached. Retry it under Delivery failures.',
  },
  bounced: {
    label: 'Bounced',
    variant: 'destructive',
    note: 'The claimant address did not accept the email. Verify it before another contact.',
  },
}

/** Whether each emailed information request reached the claimant, shown beside the request. */
export function CopyrightStaffInformationRequests({
  notice,
}: {
  notice: Pick<CopyrightStaffQueueItem, 'delivery_intents'>
}) {
  const requests = notice.delivery_intents.filter(
    intent => intent.delivery_kind === 'staff_information_request',
  )
  if (requests.length === 0) return null
  return (
    <section className='space-y-2'>
      <h3 className='font-medium'>Information request delivery</h3>
      <ul className='space-y-1 text-sm'>
        {requests.map((intent, index) => {
          const state = states[intent.state]
          return (
            <li
              className='flex flex-wrap items-center gap-2'
              key={intent.id}
            >
              <span>Information request {index + 1} emailed to the claimant</span>
              <Badge variant={state.variant}>{state.label}</Badge>
              {state.note && <span className='text-destructive'>{state.note}</span>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
