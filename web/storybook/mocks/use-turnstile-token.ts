import type { UseTurnstileTokenReturn } from '../../hooks/use-turnstile-token'

export function useTurnstileToken(): UseTurnstileTokenReturn {
  // Story form fixtures need enabled submit buttons without waiting on Turnstile.
  return {
    token: 'storybook-turnstile-token',
    reset: () => {},
    containerRef: (_node: HTMLDivElement | null) => {},
    isError: false,
    alwaysApprove: false,
  }
}
