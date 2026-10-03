'use client'

import { Badge } from '@/components/ui/badge'
import { TimeAgo } from '@/components/shared/time-ago'
import type { CopyrightStaffQueueItem, CopyrightStaffQueueReason } from '@/types/copyright-notices'

const reasonLabels: Record<CopyrightStaffQueueReason, string> = {
  form_intake_review: 'Intake review',
  restriction_review: 'Restriction review',
  appeal_review: 'Appeal review',
  counter_notice_review: 'Counter-notice review',
  legal_hold_review: 'Legal hold review',
  action_failed: 'Failed action',
  enforcement_pending: 'Enforcement pending',
  delivery_failed: 'Failed delivery',
  staydown_review: 'Possible re-upload',
  deadline_due: 'Escalation due',
  deadline_missed: 'Restoration deadline missed',
}

const urgentReasons = new Set<CopyrightStaffQueueReason>(['deadline_due', 'deadline_missed'])

/** Why a case is queued, how long its oldest open item has waited, and its next deadline. */
export function CopyrightStaffQueueStatus({ notice }: { notice: CopyrightStaffQueueItem }) {
  const deadline = notice.next_deadline
  const unassessedFiling = notice.legal_holds.some(hold => hold.assessment === null)
  return (
    <div className='mt-2 space-y-1 text-sm'>
      <ul
        aria-label='Queue reasons'
        className='flex flex-wrap gap-1'
      >
        {notice.reasons.map(reason => (
          <li key={reason}>
            <Badge
              variant={
                urgentReasons.has(reason) || (unassessedFiling && reason === 'legal_hold_review')
                  ? 'destructive'
                  : 'secondary'
              }
            >
              {unassessedFiling && reason === 'legal_hold_review'
                ? 'Filing awaiting assessment'
                : reasonLabels[reason]}
            </Badge>
          </li>
        ))}
      </ul>
      <p className='text-muted-foreground'>
        Queued <TimeAgo date={notice.waiting_since} />
      </p>
      {unassessedFiling && deadline && (
        <p className='text-muted-foreground'>
          Assess the filing by {new Date(deadline.escalation_at).toLocaleString()}
        </p>
      )}
      {deadline && (
        <p className='text-muted-foreground'>
          Next deadline: escalation {new Date(deadline.escalation_at).toLocaleString()} ·
          restoration {new Date(deadline.restoration_deadline_at).toLocaleString()}
        </p>
      )}
    </div>
  )
}
