const S3_ORIGIN_HOST = /^[a-z0-9][a-z0-9.-]*\.s3(?:\.dualstack)?\.[a-z0-9-]+\.amazonaws\.com$/u

export function parseBrowserUploadOrigins(raw: string | undefined): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw ?? '')
  } catch {
    return invalidBrowserUploadOrigins()
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return invalidBrowserUploadOrigins()
  const origins = parsed.map(value => {
    if (typeof value !== 'string') return invalidBrowserUploadOrigins()
    try {
      const url = new URL(value)
      if (
        url.protocol === 'https:' &&
        url.origin === value &&
        S3_ORIGIN_HOST.test(url.hostname) &&
        !url.username &&
        !url.password
      )
        return value
    } catch {
      return invalidBrowserUploadOrigins()
    }
    return invalidBrowserUploadOrigins()
  })
  if (new Set(origins).size !== origins.length) return invalidBrowserUploadOrigins()
  return origins
}

function invalidBrowserUploadOrigins(): never {
  throw new Error('CSP_BROWSER_UPLOAD_ORIGINS must contain exact S3 HTTPS origins')
}
