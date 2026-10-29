'use client'

import Link from 'next/link'
import { userHref } from '@/lib/links/entity-href'
import { getPlacementImageUrl } from '@/lib/utils/image-url'
import { TimeAgo } from '@/components/shared/time-ago'
import { Button } from '@/components/ui/button'
import { reviewCopyrightStaydownMatch } from '@/lib/api/client/copyright-staydown'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import type { SubmitRecovery } from './copyright-staff-review-buttons'

type Match = CopyrightStaffQueueItem['staydown_matches'][number]

function describeMatch(match: Match): string {
  const registered = 'an image this case confirmed'
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
            {describeMatch(match)}{' '}
            {match.uploaded_by_username ? (
              <Link
                href={userHref({ id: match.uploaded_by_id, username: match.uploaded_by_username })}
              >
                @{match.uploaded_by_username}
              </Link>
            ) : (
              'A former member'
            )}{' '}
            uploaded this image <TimeAgo date={match.matched_at} />.{' '}
            {match.image_placement ? (
              <a
                href={getPlacementImageUrl(
                  match.image_placement.placement_id,
                  match.image_placement.placement_revision,
                  match.image_id,
                  { width: 1200 },
                )}
                target='_blank'
                rel='noopener noreferrer'
                className='underline'
              >
                Inspect matching image
              </a>
            ) : (
              <span className='text-muted-foreground'>
                No inspectable published image is available.
              </span>
            )}
          </span>
          <Button
            data-pw='copyright-staff-staydown-matches-mark-reviewed'
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
      {notice.staydown_matches_has_more && (
        <p className='text-muted-foreground text-sm'>
          More matches are waiting. Review these to see the next ones.
        </p>
      )}
    </section>
  )
}
