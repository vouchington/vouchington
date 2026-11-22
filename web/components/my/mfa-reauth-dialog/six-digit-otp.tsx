import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp'

export function SixDigitOtp({
  code,
  labelId,
  loading,
  onComplete,
  setCode,
}: {
  code: string
  labelId: string
  loading: boolean
  onComplete: (code: string) => void
  setCode: (code: string) => void
}) {
  return (
    <InputOTP
      maxLength={6}
      value={code}
      aria-labelledby={labelId}
      onChange={(value: string) => {
        setCode(value)
        if (value.length === 6) onComplete(value)
      }}
      disabled={loading}
      pattern={/^\d*$/}
      inputMode='numeric'
    >
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
      </InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>
        <InputOTPSlot index={3} />
        <InputOTPSlot index={4} />
        <InputOTPSlot index={5} />
      </InputOTPGroup>
    </InputOTP>
  )
}
