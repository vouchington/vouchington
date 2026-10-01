import { Input } from '@/components/ui/input'

// Shown only for an initial intake with no parsed sender. Rejecting such an intake sends no reply
// unless staff type an address here, so the field says so beside the input.
export function CopyrightEmailReplyAddressField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className='space-y-1'>
      <Input
        aria-label='Reply address'
        onChange={event => onChange(event.target.value)}
        placeholder='Reply address (optional)'
        type='email'
        value={value}
      />
      <p className='text-xs text-muted-foreground'>
        No sender was parsed from this email. Rejecting it sends no reply unless you enter an
        address here.
      </p>
    </div>
  )
}
