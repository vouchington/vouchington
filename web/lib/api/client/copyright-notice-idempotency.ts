'use client'

export function withoutCopyrightCaptcha<T extends { cf_turnstile_response?: string }>(
  input: T,
): Omit<T, 'cf_turnstile_response'> {
  const { cf_turnstile_response: _, ...body } = input
  return body
}
