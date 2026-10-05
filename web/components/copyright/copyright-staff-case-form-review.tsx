'use client'

import { reviewCopyrightFormIntake } from '@/lib/api/client/copyright-notices'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import { CopyrightStaffFormGuidance } from './copyright-staff-form-guidance'
import { ReviewButtons, type SubmitReview } from './copyright-staff-review-buttons'

type FormReview = NonNullable<CopyrightStaffQueueItem['form_review']>

function screeningSummary({ screening, source_kind }: FormReview, reviewed: boolean): string {
  if (!screening) return source_kind
  if (screening.state === 'completed') {
    return `Agent: ${screening.recommendation}. ${screening.rationale}`
  }
  return reviewed
    ? `Screening ${screening.state}.`
    : `Screening ${screening.state}. Moderator review required.`
}

/**
 * The intake's screening and AI guidance stay visible after a moderator records the review, so a
 * later reviewer sees what the intake reviewer saw. Only an unreviewed intake offers the decision.
 */
export function CopyrightStaffFormReview({
  canSubmit,
  formReview,
  pending,
  rationale,
  submit,
}: {
  canSubmit: boolean
  formReview: FormReview | null
  pending: boolean
  rationale: string
  submit: SubmitReview
}) {
  if (!formReview) return null
  const { review } = formReview
  const guidance = formReview.screening?.guidance
  return (
    <>
      {review ? (
        <section className='space-y-2'>
          <h3 className='font-medium'>Form review recorded</h3>
          <p className='text-sm'>
            {review.is_accepted ? 'Approved' : 'Rejected'} by{' '}
            {review.reviewed_by_id ?? 'a deleted moderator account'} on{' '}
            <time dateTime={review.reviewed_at}>
              {new Date(review.reviewed_at).toLocaleString()}
            </time>
            .
          </p>
          <p className='text-sm'>{screeningSummary(formReview, true)}</p>
        </section>
      ) : (
        <ReviewButtons
          pending={pending}
          canSubmit={canSubmit}
          submit={submit}
          approve={() => reviewCopyrightFormIntake(formReview.intake_id, true, rationale)}
          reject={() => reviewCopyrightFormIntake(formReview.intake_id, false, rationale)}
          heading='Pending form review'
          description={screeningSummary(formReview, false)}
          approveLabel='Approve intake'
          rejectLabel='Reject intake'
        />
      )}
      {guidance ? <CopyrightStaffFormGuidance guidance={guidance} /> : null}
    </>
  )
}
