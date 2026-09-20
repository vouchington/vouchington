import { Button } from '@/components/ui/button'

export type SubmitReview = (action: () => Promise<unknown>, success: string) => void

/** Deliberately separate from review decisions, which require a staff rationale. */
export type SubmitRecovery = (action: () => Promise<unknown>, success: string) => void

export function ReviewButtons({
  pending,
  canSubmit,
  submit,
  approve,
  reject,
  heading,
  description,
  approveLabel,
  rejectLabel,
}: {
  pending: boolean
  canSubmit: boolean
  submit: SubmitReview
  approve: () => Promise<unknown>
  reject: () => Promise<unknown>
  heading: string
  description: string
  approveLabel: string
  rejectLabel: string
}) {
  return (
    <section className='space-y-2'>
      <h3 className='font-medium'>{heading}</h3>
      <p className='text-sm'>{description}</p>
      <div className='flex gap-2'>
        <Button
          disabled={pending || !canSubmit}
          onClick={() => submit(approve, `${approveLabel} recorded.`)}
        >
          {approveLabel}
        </Button>
        <Button
          variant='destructive'
          disabled={pending || !canSubmit}
          onClick={() => submit(reject, `${rejectLabel} recorded.`)}
        >
          {rejectLabel}
        </Button>
      </div>
    </section>
  )
}
