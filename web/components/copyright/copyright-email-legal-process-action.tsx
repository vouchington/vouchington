import { useId, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  listCopyrightEmailIntakes,
  recordCopyrightEmailIntakeLegalProcess,
  type CopyrightEmailIntake,
} from '@/lib/api/client/copyright-email-intakes'
import type { CopyrightEmailIntakeQueuePage } from '@/types/copyright-notices'
import {
  COPYRIGHT_EMAIL_LEGAL_PROCESS_REASON_MAX_LENGTH as maxLength,
  copyrightEmailLegalProcessReasonLength,
  isValidCopyrightEmailLegalProcessReason,
} from './copyright-email-legal-process-model'
import { copyrightEmailActionError } from './copyright-email-review-decision'

// Records an initial email intake as legal process (for example a subpoena) so it stops waiting
// for review without a reply or a case. The reason is never echoed back: it is typed here, sent
// once, and kept encrypted on the server. `onRecorded` receives the refreshed queue, or null when
// the decision was recorded but the queue could not be reloaded.
export function CopyrightEmailLegalProcessAction({
  detail,
  disabled,
  onRecorded,
}: {
  detail: Pick<CopyrightEmailIntake, 'id' | 'review_path'>
  disabled: boolean
  onRecorded: (queue: CopyrightEmailIntakeQueuePage | null) => void
}) {
  const countId = useId()
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (detail.review_path !== 'initial') return null
  const length = copyrightEmailLegalProcessReasonLength(reason)
  const tooLong = length > maxLength

  async function confirm() {
    setPending(true)
    setError(null)
    try {
      await recordCopyrightEmailIntakeLegalProcess(detail.id, reason.trim())
    } catch (caught) {
      setError(copyrightEmailActionError(caught, 'We could not record that legal process.'))
      setPending(false)
      return
    }
    const queue = await listCopyrightEmailIntakes().catch(() => null)
    setPending(false)
    onRecorded(queue)
  }
  function cancel() {
    setConfirming(false)
    setReason('')
    setError(null)
  }

  return (
    <section className='space-y-3 rounded border p-3'>
      <h3 className='font-medium'>Legal process</h3>
      <p className='text-sm text-muted-foreground'>
        For a subpoena or other legal process sent to this address. It records who decided and why,
        removes the email from this queue, and sends no reply. It does not approve or reject the
        email as a copyright notice, so no case is opened. It cannot be undone.
      </p>
      {error && (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {confirming ? (
        <div className='space-y-2'>
          <Textarea
            aria-describedby={countId}
            aria-invalid={tooLong}
            aria-label='Legal process reason'
            onChange={event => setReason(event.target.value)}
            placeholder='Short reason, for example the kind of legal process and who handles it'
            value={reason}
          />
          <p
            className={tooLong ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
            id={countId}
          >
            {`${length.toLocaleString('en-US')} / ${maxLength.toLocaleString('en-US')}`}
          </p>
          <div className='flex flex-wrap gap-2'>
            <Button
              disabled={disabled || pending || !isValidCopyrightEmailLegalProcessReason(reason)}
              onClick={confirm}
              variant='destructive'
            >
              Confirm legal process
            </Button>
            <Button
              disabled={pending}
              onClick={cancel}
              variant='outline'
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          disabled={disabled}
          onClick={() => setConfirming(true)}
          variant='outline'
        >
          Record as legal process
        </Button>
      )}
    </section>
  )
}
