'use client'

export function LoginTurnstileSlot({
  turnstileRef,
}: {
  turnstileRef: (node: HTMLDivElement | null) => void
}) {
  return (
    <div
      ref={turnstileRef}
      data-pw='login-turnstile-container'
    />
  )
}
