/** Browser challenge actions follow Cloudflare's restricted alphabet, while native tags retain dots. */
export function toTurnstileAction(actionTag: string): string {
  const action = actionTag.replaceAll('.', '-')
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(action)) throw new Error('Invalid Turnstile action')
  return action
}
