const SHARED_CACHE_VOLATILE_HEADERS = [
  'content-security-policy',
  'content-security-policy-report-only',
]

export const copyHeaders = (headers: Headers): Headers => {
  const copiedHeaders = new Headers()
  headers.forEach((value, key) => {
    copiedHeaders.append(key, value)
  })
  return copiedHeaders
}

export const stripCacheHeaders = (headers: Headers): Headers => {
  const sanitizedHeaders = copyHeaders(headers)
  for (const headerName of SHARED_CACHE_VOLATILE_HEADERS) {
    sanitizedHeaders.delete(headerName)
  }
  return sanitizedHeaders
}

export const stripCacheResponseHeaders = (response: Response): Response =>
  new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: stripCacheHeaders(response.headers),
  })
