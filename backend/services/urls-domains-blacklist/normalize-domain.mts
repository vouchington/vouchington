// Simple domain validation regex - checks for basic domain format
const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/

export function normalizeDomain(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  // Skip comments (lines starting with #)
  if (trimmed.startsWith('#')) return null

  const domain = trimmed.toLowerCase()

  // Basic domain format validation
  if (!DOMAIN_REGEX.test(domain)) return null

  return domain
}
