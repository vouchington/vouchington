import { useId } from 'react'
import { Textarea } from '@/components/ui/textarea'
import {
  COPYRIGHT_EMAIL_INFORMATION_MESSAGE_MAX_LENGTH as maxLength,
  copyrightEmailInformationMessageLength,
} from './copyright-email-information-request-model'

// The message "Request information" sends to the sender. Rejecting ignores it, so the help text
// says what it is for and that the intake is closed either way.
export function CopyrightEmailInformationRequestField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const countId = useId()
  const length = copyrightEmailInformationMessageLength(value)
  const tooLong = length > maxLength
  return (
    <div className='space-y-1'>
      <Textarea
        aria-describedby={countId}
        aria-invalid={tooLong}
        aria-label='Information request message'
        onChange={event => onChange(event.target.value)}
        placeholder='Message asking the sender for the missing elements'
        value={value}
      />
      <p
        className={tooLong ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
        id={countId}
      >
        {`${length.toLocaleString('en-US')} / ${maxLength.toLocaleString('en-US')}`}
      </p>
      {tooLong && (
        <p
          className='text-xs text-destructive'
          role='alert'
        >
          {`The message must be ${maxLength.toLocaleString('en-US')} characters or fewer.`}
        </p>
      )}
      <p className='text-xs text-muted-foreground'>
        Request information sends this message to the sender and closes the intake without opening a
        case. Reject ignores it.
      </p>
    </div>
  )
}
