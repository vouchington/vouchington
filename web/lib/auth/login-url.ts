export function sanitizeLoginNext(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  if (hasUnsafePathCharacter(value)) return '/'

  let decodedValue = value
  try {
    decodedValue = decodeURIComponent(value)
  } catch {
    return '/'
  }

  // Remove decoded tab, LF, FF, and CR before protocol-relative checks.
  const normalizedValue = decodedValue.replace(/[\t\n\f\r]/g, '')
  if (normalizedValue.startsWith('//') || normalizedValue.includes('\\')) {
    return '/'
  }

  const sameOriginUrl = new URL(value, 'https://voucha.invalid')
  if (sameOriginUrl.origin !== 'https://voucha.invalid') return '/'

  return `${sameOriginUrl.pathname}${sameOriginUrl.search}${sameOriginUrl.hash}`
}

function hasUnsafePathCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0)!
    if (code < 32 || code === 127 || char === '\\') return true
  }
  return false
}

export function buildLoginHref({
  intent,
  next,
}: {
  intent?: string
  next?: string
} = {}): string {
  const params = new URLSearchParams()
  if (next) params.set('next', sanitizeLoginNext(next))
  if (intent) params.set('intent', intent)

  const query = params.toString()
  return query ? `/login?${query}` : '/login'
}
