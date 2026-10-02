'use client'

import { TimeAgo } from '@/components/shared/time-ago'
import { Button } from '@/components/ui/button'
import { reviewCopyrightStaydownMatch } from '@/lib/api/client/copyright-staydown'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import type { SubmitRecovery } from './copyright-staff-review-buttons'

type Match = CopyrightStaffQueueItem['staydown_matches'][number]

function describeMatch(match: Match): string {
  const registered = `image ${match.registered_image_id} that this case confirmed`
  return match.match_kind === 'exact'
    ? `Identical re-upload of ${registered}.`
    : `Near-duplicate (${match.hamming_distance} of 64 bits differ) of ${registered}.`
}

/**
 * Uploads that look like an image this case confirmed as infringing. They were published as
 * usual; staff compare the upload with the case and mark the match reviewed. A match is a prompt
 * to look, never a finding.
 */
export function CopyrightStaffStaydownMatches({
  notice,
  pending,
  submitRecovery,
}: {
  notice: CopyrightStaffQueueItem
  pending: boolean
  submitRecovery: SubmitRecovery
}) {
  if (notice.staydown_matches.length === 0) return null
  return (
    <section className='space-y-2'>
      <h3 className='font-medium'>Possible re-uploads</h3>
      {notice.staydown_matches.map(match => (
        <div
          className='flex items-center justify-between gap-2 text-sm'
          key={match.id}
        >
          <span>
            {describeMatch(match)} Upload {match.image_id} by user {match.uploaded_by_id},{' '}
            <TimeAgo date={match.matched_at} />.
          </span>
          <Button
            disabled={pending}
            onClick={() =>
              submitRecovery(
                () => reviewCopyrightStaydownMatch(notice.id, match.id),
                'Possible re-upload marked reviewed.',
              )
            }
          >
            Mark reviewed
          </Button>
        </div>
      ))}
    </section>
  )
}
