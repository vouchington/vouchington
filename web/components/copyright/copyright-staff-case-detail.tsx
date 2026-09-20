import { Button } from '@/components/ui/button'
import {
  replayCopyrightActionIntent,
  replayCopyrightDeliveryIntent,
  reviewCopyrightCounterNotice,
} from '@/lib/api/client/copyright-notices'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
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
      <section>
        <h3 className='font-medium'>Targets</h3>
        <ul className='text-sm'>
          {notice.targets.map(target => (
            <li key={target.id}>
              {target.hosted_use_url} · placement {target.placement_key} rev.{' '}
              {target.placement_revision}
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

export function CopyrightStaffIntentRecovery({
  notice,
  pending,
  submit,
}: Pick<Props, 'notice' | 'pending' | 'submit'>) {
  const failedActions = notice.action_intents.filter(intent => intent.state === 'failed')
  const failedDeliveries = notice.delivery_intents.filter(intent => intent.state === 'failed')
  const bouncedDeliveries = notice.delivery_intents.filter(intent => intent.state === 'bounced')
  if (failedActions.length + failedDeliveries.length + bouncedDeliveries.length === 0) return null
  return (
    <section className='space-y-2'>
      <h3 className='font-medium'>Delivery failures</h3>
      {failedActions.map(intent => (
        <RecoveryRow
          key={intent.id}
          pending={pending}
          retry={() => replayCopyrightActionIntent(notice.id, intent.id)}
          success='Media action queued again.'
          submit={submit}
        >
          Media {intent.action} failed{intent.failure_message ? `: ${intent.failure_message}` : ''}
        </RecoveryRow>
      ))}
      {failedDeliveries.map(intent => (
        <RecoveryRow
          key={intent.id}
          pending={pending}
          retry={() => replayCopyrightDeliveryIntent(notice.id, intent.id)}
          success='Notice delivery queued again.'
          submit={submit}
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
  submit,
  success,
}: {
  children: React.ReactNode
  pending: boolean
  retry: () => Promise<unknown>
  submit: SubmitReview
  success: string
}) {
  return (
    <div className='flex items-center justify-between gap-2 text-sm'>
      <span>{children}</span>
      <Button
        disabled={pending}
        onClick={() => submit(retry, success)}
      >
        Retry
      </Button>
    </div>
  )
}
