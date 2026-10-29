import { reviewCopyrightCounterNotice } from '@/lib/api/client/copyright-notices'
import { copyrightImageSurfaceLabel, type CopyrightStaffQueueItem } from '@/types/copyright-notices'
import { CopyrightStaffClaimantMisuse } from './copyright-staff-claimant-misuse'
import { CopyrightStaffSubmissionGuidance } from './copyright-staff-submission-guidance'
import { ReviewButtons, type SubmitReview } from './copyright-staff-review-buttons'

type Props = {
  canSubmit: boolean
  notice: CopyrightStaffQueueItem
  pending: boolean
  rationale: string
  submit: SubmitReview
}

export function CopyrightStaffCounterNotices({
  canSubmit,
  notice,
  pending,
  rationale,
  submit,
}: Props) {
  return notice.counter_notices.map(counter => (
    <section
      key={counter.submission_id}
      className='space-y-2'
    >
      <h3 className='font-medium'>Counter-notice</h3>
      <pre className='overflow-auto rounded bg-muted p-2 text-xs'>
        {JSON.stringify(counter.statement, null, 2)}
      </pre>
      {counter.guidance ? (
        <CopyrightStaffSubmissionGuidance
          kind='counter_notice'
          guidance={counter.guidance}
        />
      ) : null}
      <ReviewButtons
        pending={pending}
        canSubmit={canSubmit}
        submit={submit}
        approve={() => reviewCopyrightCounterNotice(counter.submission_id, true, rationale)}
        reject={() => reviewCopyrightCounterNotice(counter.submission_id, false, rationale)}
        heading='Decision'
        description='A statutory counter-notice requires a recorded decision.'
        approveLabel='Accept counter-notice'
        rejectLabel='Reject counter-notice'
      />
    </section>
  ))
}

export function CopyrightStaffCorrespondence({ notice }: { notice: CopyrightStaffQueueItem }) {
  return notice.email_correspondence.map(correspondence => (
    <section
      className='rounded border p-3 text-sm'
      key={`${correspondence.kind}-${correspondence.reviewed_at}-${correspondence.submission_id}`}
    >
      <h3 className='font-medium'>Email correspondence: {correspondence.kind}</h3>
      <p className='text-muted-foreground'>
        {correspondence.action === 'admitted'
          ? correspondence.kind === 'withdrawal'
            ? 'Recorded as evidence; no automatic restoration was performed.'
            : 'Admitted and routed to the matching case workflow where applicable.'
          : 'Rejected by staff.'}
      </p>
    </section>
  ))
}

export function CopyrightStaffComplaint({ notice }: { notice: CopyrightStaffQueueItem }) {
  return (
    <>
      <section>
        <h3 className='font-medium'>Complaint</h3>
        <p>{notice.work_description}</p>
        <p className='text-sm'>
          {notice.claimant.display_name ?? 'No display name'} · {notice.claimant.contact}
        </p>
      </section>
      <CopyrightStaffClaimantMisuse misuse={notice.claimant.misuse} />
      <section>
        <h3 className='font-medium'>Targets</h3>
        <ul className='text-sm'>
          {notice.targets.map(target => (
            <li key={target.id}>
              {copyrightImageSurfaceLabel(target.surface)} · {target.hosted_use_url} · placement
              revision {target.placement_revision}
              {target.surface !== 'post-image' && (
                <p className='text-muted-foreground'>
                  {target.provenance
                    ? `Set by ${target.provenance.set_by_administrator === true ? 'an administrator (no setter notice)' : 'a member'}; uploaded by a member`
                    : 'Setter unknown; no setter notice'}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
      {notice.evidence.length > 0 && (
        <section>
          <h3 className='font-medium'>Evidence metadata</h3>
          <ul className='text-sm'>
            {notice.evidence.map(evidence => (
              <li key={evidence.id}>
                {evidence.mime_type} · {evidence.byte_size} bytes · SHA-256 {evidence.sha256}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
