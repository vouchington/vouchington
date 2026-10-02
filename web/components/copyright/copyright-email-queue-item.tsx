'use client'

import { Button } from '@/components/ui/button'
import { TimeAgo } from '@/components/shared/time-ago'
import type {
  CopyrightEmailIntakeQueueItem,
  CopyrightEmailIntakeQueuePage,
} from '@/types/copyright-notices'
import { CopyrightEmailReplyRetry } from './copyright-email-reply-retry'

const reviewPathLabels = {
  initial: 'Initial intake',
  matched_thread: 'Matched correspondence',
  unresolved_thread: 'Unresolved reply',
} as const

/**
 * One row of the staff email review queue: the intake to open, why it still waits, and the retry for
 * a declined intake whose reply failed.
 */
export function CopyrightEmailQueueItem({
  item,
  disabled,
  onSelect,
  resetQueue,
  setError,
  setSuccess,
}: {
  item: CopyrightEmailIntakeQueueItem
  disabled: boolean
  onSelect: (id: string) => void
  resetQueue: (page: CopyrightEmailIntakeQueuePage) => void
  setError: (value: string | null) => void
  setSuccess: (value: string | null) => void
}) {
  return (
    <li>
      <Button
        disabled={disabled}
        onClick={() => onSelect(item.id)}
        variant='link'
      >
        {reviewPathLabels[item.review_path]} {item.id}
      </Button>
      <p className='text-xs text-muted-foreground'>
        Received <TimeAgo date={item.received_at} />
      </p>
      {item.waiting_reason !== 'awaiting_review' && (
        <p className='text-xs text-destructive'>
          {item.waiting_reason === 'reply_bounced'
            ? 'Reply to the sender bounced'
            : 'Reply to the sender could not be sent'}
          , waiting <TimeAgo date={item.waiting_since} />
        </p>
      )}
      {item.waiting_reason === 'reply_failed' && (
        <CopyrightEmailReplyRetry
          intakeId={item.id}
          disabled={disabled}
          resetQueue={resetQueue}
          setError={setError}
          setSuccess={setSuccess}
        />
      )}
      {item.parse_status !== 'succeeded' && (
        <p className='text-xs text-destructive'>
          {item.parse_status === 'failed' ? 'Parse failed' : 'No parse recorded'}
        </p>
      )}
    </li>
  )
}
