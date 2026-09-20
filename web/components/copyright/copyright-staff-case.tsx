'use client'

import {
  reviewCopyrightFormIntake,
  reviewCopyrightRestriction,
} from '@/lib/api/client/copyright-notices'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import { CopyrightStaffAppealReview } from './copyright-staff-case-appeal'
import {
  CopyrightStaffComplaint,
  CopyrightStaffCorrespondence,
  CopyrightStaffCounterNotices,
  CopyrightStaffIntentRecovery,
} from './copyright-staff-case-detail'
import { CopyrightStaffLegalHoldReview } from './copyright-staff-case-legal-hold'
import {
  ReviewButtons,
  type SubmitRecovery,
  type SubmitReview,
} from './copyright-staff-review-buttons'

export function CopyrightStaffCase({
  notice,
  pending,
  rationale,
  submit,
  submitRecovery,
}: {
  notice: CopyrightStaffQueueItem
  pending: boolean
  rationale: string
  submit: SubmitReview
  submitRecovery: SubmitRecovery
}) {
  const canSubmit = rationale.length > 0
  return (
    <article className='space-y-4 rounded border p-4'>
      <header>
        <h2 className='font-semibold'>Case {notice.id}</h2>
        <p className='text-sm text-muted-foreground'>
          {notice.jurisdiction} · received {new Date(notice.received_at).toLocaleString()}
        </p>
      </header>
      <CopyrightStaffComplaint notice={notice} />
      <CopyrightStaffFormReview {...{ canSubmit, notice, pending, rationale, submit }} />
      <CopyrightStaffRestrictionReviews {...{ canSubmit, notice, pending, rationale, submit }} />
      {notice.appeals.map(appeal => (
        <CopyrightStaffAppealReview
          appeal={appeal}
          canSubmit={canSubmit}
          key={appeal.submission_id}
          pending={pending}
          rationale={rationale}
          restrictions={notice.restrictions}
          submit={submit}
        />
      ))}
      <CopyrightStaffCounterNotices {...{ canSubmit, notice, pending, rationale, submit }} />
      {notice.legal_holds.map(hold => (
        <CopyrightStaffLegalHoldReview
          hold={hold}
          key={hold.submission_id}
          pending={pending}
          rationale={rationale}
          submit={submit}
          targets={notice.targets}
        />
      ))}
      <CopyrightStaffCorrespondence notice={notice} />
      <CopyrightStaffIntentRecovery {...{ notice, pending, submitRecovery }} />
    </article>
  )
}

type ReviewProps = {
  canSubmit: boolean
  notice: CopyrightStaffQueueItem
  pending: boolean
  rationale: string
  submit: SubmitReview
}

function CopyrightStaffFormReview({ canSubmit, notice, pending, rationale, submit }: ReviewProps) {
  if (!notice.form_review) return null
  const { form_review: formReview } = notice
  return (
    <ReviewButtons
      pending={pending}
      canSubmit={canSubmit}
      submit={submit}
      approve={() => reviewCopyrightFormIntake(formReview.intake_id, true, rationale)}
      reject={() => reviewCopyrightFormIntake(formReview.intake_id, false, rationale)}
      heading='Pending form review'
      description={
        formReview.screening
          ? `Agent: ${formReview.screening.recommendation}. ${formReview.screening.rationale}`
          : formReview.source_kind
      }
      approveLabel='Approve intake'
      rejectLabel='Reject intake'
    />
  )
}

function CopyrightStaffRestrictionReviews({
  canSubmit,
  notice,
  pending,
  rationale,
  submit,
}: ReviewProps) {
  return notice.restrictions.map(restriction =>
    restriction.status === 'pending_review' ? (
      <ReviewButtons
        key={restriction.id}
        pending={pending}
        canSubmit={canSubmit}
        submit={submit}
        approve={() => reviewCopyrightRestriction(notice.id, restriction.id, 'confirm', rationale)}
        reject={() => reviewCopyrightRestriction(notice.id, restriction.id, 'reverse', rationale)}
        heading='Pending restriction review'
        description={`Target ${restriction.target_id}`}
        approveLabel='Confirm restriction'
        rejectLabel='Reverse restriction'
      />
    ) : null,
  )
}
