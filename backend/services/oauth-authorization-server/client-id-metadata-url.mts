export function parseClientIdMetadataUrl(value: string): string | null {
  const authorityStart = 'https://'.length
  const pathStart = value.indexOf('/', authorityStart)
  const queryStart = value.indexOf('?', authorityStart)
  if (
    value.length > 2048 ||
    pathStart <= authorityStart ||
    (queryStart !== -1 && pathStart > queryStart) ||
    !/^https:\/\//iu.test(value) ||
    value.includes('#') ||
    value.includes('\\') ||
    /[\s\p{Cc}\p{Z}]/u.test(value) ||
    value.slice(authorityStart, pathStart).includes('@')
  ) {
    return null
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null
  const rawPath = value.slice(pathStart).split('?', 1)[0] ?? ''
  try {
    if (rawPath.split('/').some(segment => ['.', '..'].includes(decodeURIComponent(segment)))) {
      return null
    }
  } catch {
    return null
  }
  return value
}
