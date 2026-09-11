const HONEYPOT_FIELDS = ['hp_website', 'hp_phone'] as const

export function isHoneypotTriggered(body: Record<string, unknown>): boolean {
  for (const field of HONEYPOT_FIELDS) {
    const value = body[field]
    if (value != null && String(value).trim() !== '') {
      return true
    }
  }
  return false
}
