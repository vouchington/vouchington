import type { useLoginTurnstile as useLoginTurnstileActual } from '../../hooks/use-login-turnstile'

export const useLoginTurnstile: typeof useLoginTurnstileActual = () => {
  // Stories must not load the live Cloudflare Turnstile script or widget.
  return {
    alwaysApprove: false,
    ref: (_node: HTMLDivElement | null) => {},
    reset: () => {},
    token: null,
  }
}
