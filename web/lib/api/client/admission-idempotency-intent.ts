'use client'

export async function fingerprintAdmissionIntent(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

const TRANSIENT_ADMISSION_FIELDS = new Set([
  'cf_turnstile_response',
  'recaptcha_token',
  'hp_website',
  'hp_phone',
])

export function canonicalizeAdmissionIntent(value: unknown): string {
  return JSON.stringify(sortIntent(value))
}

function sortIntent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortIntent)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key, entry]) => entry !== undefined && !TRANSIENT_ADMISSION_FIELDS.has(key))
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortIntent(entry)]),
    )
  }
  return value
}
