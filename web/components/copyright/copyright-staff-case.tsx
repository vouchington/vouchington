'use client'

import { reviewCopyrightRestriction } from '@/lib/api/client/copyright-notices'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import { CopyrightStaffAppealReview } from './copyright-staff-case-appeal'
import {
  CopyrightStaffComplaint,
  CopyrightStaffCorrespondence,
  CopyrightStaffCounterNotices,
} from './copyright-staff-case-detail'
import { CopyrightStaffIntentRecovery } from './copyright-staff-intent-recovery'
import { CopyrightStaffFormReview } from './copyright-staff-case-form-review'
import { CopyrightStaffGuestCapability } from './copyright-staff-guest-capability'
import { CopyrightStaffInformationRequests } from './copyright-staff-information-requests'
import { CopyrightRepeatInfringerActions } from './copyright-repeat-infringer-actions'
import { CopyrightStaffLegalHoldReview } from './copyright-staff-case-legal-hold'
import { CopyrightStaffQueueStatus } from './copyright-staff-queue-status'
import { CopyrightStaffStaydownMatches } from './copyright-staff-staydown-matches'
import { CopyrightStaffTerritorial } from './copyright-staff-territorial'
import {
  ReviewButtons,
  type SubmitRecovery,
  type SubmitReview,
} from './copyright-staff-review-buttons'
import { copyrightCaseLabel } from './copyright-case-label'

export function CopyrightStaffCase({
  notice,
  canAdminister = false,
  pending,
  rationale,
  submit,
  submitRecovery,
}: {
  notice: CopyrightStaffQueueItem
  canAdminister?: boolean
  pending: boolean
  rationale: string
  submit: SubmitReview
  submitRecovery: SubmitRecovery
}) {
  const canSubmit = rationale.length > 0
  const isUsNotice = notice.jurisdiction === 'us_dmca'
  return (
    <article
      className='space-y-4 rounded border p-4'
      data-pw='copyright-staff-case'
      data-notice-id={notice.id}
    >
      <header>
        <h2 className='font-semibold'>{copyrightCaseLabel(notice)}</h2>
        <p className='text-sm text-muted-foreground'>
          {notice.jurisdiction} · received {new Date(notice.received_at).toLocaleString()}
        </p>
        <CopyrightStaffQueueStatus notice={notice} />
      </header>
      <CopyrightStaffComplaint notice={notice} />
      {isUsNotice ? (
        <>
          <CopyrightStaffFormReview
            {...{ canSubmit, pending, rationale, submit }}
            formReview={notice.form_review}
          />
          <CopyrightStaffRestrictionReviews
            {...{ canSubmit, notice, pending, rationale, submit }}
          />
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
          <CopyrightStaffGuestCapability noticeId={notice.id} />
          <CopyrightStaffInformationRequests notice={notice} />
        </>
      ) : (
        <CopyrightStaffTerritorial
          item={notice}
          pending={pending}
          onReview={submitRecovery}
        />
      )}
      <CopyrightStaffCorrespondence notice={notice} />
      <CopyrightStaffIntentRecovery {...{ notice, pending, submitRecovery }} />
      <CopyrightStaffStaydownMatches {...{ notice, pending, submitRecovery }} />
      <CopyrightRepeatInfringerActions
        canAdminister={canAdminister}
        canSubmit={canSubmit}
        noticeId={notice.id}
        pending={pending}
        rationale={rationale}
        submit={submit}
      />
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

function CopyrightStaffRestrictionReviews({
  canSubmit,
  notice,
  pending,
  rationale,
  submit,
}: ReviewProps) {
  return notice.restrictions.map(restriction => {
    if (restriction.status !== 'pending_review') return null
    const target = notice.targets.find(item => item.id === restriction.target_id)
    return (
      <section
        key={restriction.id}
        className='space-y-2'
        aria-label={`Restriction review for ${target?.hosted_use_url ?? 'unavailable hosted material'}`}
      >
        <p className='text-sm'>
          {target ? (
            <a
              className='underline'
              href={target.hosted_use_url}
            >
              {target.hosted_use_url}
            </a>
          ) : (
            'Hosted material reference unavailable.'
          )}
        </p>
        <ReviewButtons
          pending={pending}
          canSubmit={canSubmit}
          submit={submit}
          approve={() =>
            reviewCopyrightRestriction(notice.id, restriction.id, 'confirm', rationale)
          }
          reject={() => reviewCopyrightRestriction(notice.id, restriction.id, 'reverse', rationale)}
          heading='Pending restriction review'
          description='Affected hosted material'
          approveLabel='Confirm restriction'
          rejectLabel='Reverse restriction'
        />
      </section>
    )
  })
}
