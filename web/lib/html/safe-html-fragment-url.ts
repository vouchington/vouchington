const LINK_SCHEMES = new Set(['http', 'https', 'mailto', 'tel'])
const IMAGE_SCHEMES = new Set(['http', 'https'])

export function isSafeLinkUrl(value: string): boolean {
  return isSafeUrl(value, LINK_SCHEMES)
}

export function isSafeImageUrl(value: string): boolean {
  return isSafeUrl(value, IMAGE_SCHEMES)
}

function isSafeUrl(value: string, allowedSchemes: Set<string>): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith('//')) return false

  const normalized = trimmed.replace(/[\t\n\f\r ]+/g, '')
  const colonIndex = normalized.indexOf(':')
  if (colonIndex === -1) return true

  const separatorIndex = firstUrlPathQueryOrFragmentIndex(normalized)
  if (separatorIndex !== -1 && separatorIndex < colonIndex) return true

  const scheme = normalized.slice(0, colonIndex)
  if (!/^[a-z][a-z0-9+.-]*$/i.test(scheme)) return false
  return allowedSchemes.has(scheme.toLowerCase())
}

function firstUrlPathQueryOrFragmentIndex(value: string): number {
  const indexes = ['/', '?', '#'].flatMap(separator => {
    const i = value.indexOf(separator)
    return i !== -1 ? [i] : []
  })
  return indexes.length > 0 ? Math.min(...indexes) : -1
}
