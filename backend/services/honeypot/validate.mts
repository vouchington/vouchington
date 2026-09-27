const HONEYPOT_FIELDS = ['hp_website', 'hp_phone'] as const

export function isHoneypotTriggered(body: unknown): boolean {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return false
  const record = body as Record<string, unknown>
  for (const field of HONEYPOT_FIELDS) {
    const value = record[field]
    if (value != null && String(value).trim() !== '') {
      return true
    }
  }
  return false
}
