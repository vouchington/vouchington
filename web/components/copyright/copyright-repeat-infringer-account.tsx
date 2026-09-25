'use client'

import { Button } from '@/components/ui/button'
import {
  recordCopyrightRepeatInfringerDisposition,
  recordCopyrightRepeatInfringerReinstatement,
  recordCopyrightRepeatInfringerReviewOutcome,
  type CopyrightRepeatInfringerAccountRecord,
} from '@/lib/api/client/copyright-repeat-infringer'
import type { SubmitReview } from './copyright-staff-review-buttons'

export function RepeatInfringerAccount({
  account,
  canAdminister,
  canSubmit,
  pending,
  rationale,
  submit,
}: {
  account: CopyrightRepeatInfringerAccountRecord
  canAdminister: boolean
  canSubmit: boolean
  pending: boolean
  rationale: string
  submit: SubmitReview
}) {
  const disabled = pending || !canSubmit
  return (
    <section className='space-y-2'>
      <h3 className='font-medium'>Repeat-infringer review</h3>
      <p className='text-sm text-muted-foreground'>Account {account.account_user_id}</p>
      {account.operative ? (
        <div className='flex flex-wrap gap-2'>
          <DecisionButton
            disabled={disabled}
            label='Mark withdrawn'
            onClick={() =>
              submit(
                () =>
                  recordCopyrightRepeatInfringerDisposition(
                    account.incident_id,
                    'withdrawn',
                    rationale,
                  ),
                'Withdrawal recorded.',
              )
            }
          />
          <DecisionButton
            disabled={disabled}
            label='Mark duplicate'
            onClick={() =>
              submit(
                () =>
                  recordCopyrightRepeatInfringerDisposition(
                    account.incident_id,
                    'duplicate',
                    rationale,
                  ),
                'Duplicate recorded.',
              )
            }
          />
          <DecisionButton
            disabled={disabled}
            label='Mark abusive'
            onClick={() =>
              submit(
                () =>
                  recordCopyrightRepeatInfringerDisposition(
                    account.incident_id,
                    'abusive',
                    rationale,
                  ),
                'Abusive notice recorded.',
              )
            }
          />
        </div>
      ) : (
        <p className='text-sm'>This incident does not count.</p>
      )}
      {account.open_review_id ? (
        <OpenReviewDecisions
          canAdminister={canAdminister}
          disabled={disabled}
          rationale={rationale}
          reviewId={account.open_review_id}
          submit={submit}
        />
      ) : null}
      {canAdminister && account.termination_in_effect ? (
        <DecisionButton
          disabled={disabled}
          label='Record reinstatement'
          onClick={() =>
            submit(
              () => recordCopyrightRepeatInfringerReinstatement(account.account_user_id, rationale),
              'Reinstatement recorded. Unsuspend the account separately.',
            )
          }
        />
      ) : null}
    </section>
  )
}

function OpenReviewDecisions({
  canAdminister,
  disabled,
  rationale,
  reviewId,
  submit,
}: {
  canAdminister: boolean
  disabled: boolean
  rationale: string
  reviewId: string
  submit: SubmitReview
}) {
  return (
    <div className='flex flex-wrap gap-2'>
      <DecisionButton
        disabled={disabled}
        label='Record warning'
        onClick={() =>
          submit(
            () => recordCopyrightRepeatInfringerReviewOutcome(reviewId, 'warning', rationale),
            'Warning recorded.',
          )
        }
      />
      <DecisionButton
        disabled={disabled}
        label='Record no action'
        onClick={() =>
          submit(
            () => recordCopyrightRepeatInfringerReviewOutcome(reviewId, 'no_action', rationale),
            'No action recorded.',
          )
        }
      />
      {canAdminister ? (
        <>
          <DecisionButton
            disabled={disabled}
            label='Restrict account'
            onClick={() =>
              submit(
                () => recordCopyrightRepeatInfringerReviewOutcome(reviewId, 'restrict', rationale),
                'Restriction recorded.',
              )
            }
          />
          <DecisionButton
            disabled={disabled}
            label='Terminate account'
            onClick={() =>
              submit(
                () => recordCopyrightRepeatInfringerReviewOutcome(reviewId, 'terminate', rationale),
                'Termination recorded.',
              )
            }
          />
        </>
      ) : null}
    </div>
  )
}

function DecisionButton({
  disabled,
  label,
  onClick,
}: {
  disabled: boolean
  label: string
  onClick: () => void
}) {
  return (
    <Button
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </Button>
  )
}
