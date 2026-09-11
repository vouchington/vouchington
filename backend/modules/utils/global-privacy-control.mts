type HeadersLike =
  | Headers
  | {
      [key: string]: string | string[] | undefined
    }

export function hasGlobalPrivacyControlHeaders(headers: HeadersLike): boolean {
  return (
    getHeaderValue(headers, 'sec-gpc') === '1' || getHeaderValue(headers, 'x-voucha-gpc') === '1'
  )
}

function getHeaderValue(headers: HeadersLike, name: string): string | undefined {
  if ('get' in headers && typeof headers.get === 'function') {
    return headers.get(name) ?? undefined
  }
  const headerRecord = headers as Record<string, string | string[] | undefined>
  const matchingKey = Object.keys(headerRecord).find(key => key.toLowerCase() === name)
  const value = matchingKey ? headerRecord[matchingKey] : undefined
  return Array.isArray(value) ? value[0] : value
}
