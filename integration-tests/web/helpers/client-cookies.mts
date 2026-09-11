export class WebIntegrationCookies {
  private readonly cookies = new Map<string, string>()

  captureSetCookies(response: Response): void {
    const setCookies = getSetCookieHeaders(response.headers)

    for (const header of setCookies) {
      const [cookiePart] = header.split(';')
      const separatorIndex = cookiePart.indexOf('=')
      if (separatorIndex === -1) continue

      const name = cookiePart.slice(0, separatorIndex)
      const value = cookiePart.slice(separatorIndex + 1)

      if (value) {
        this.cookies.set(name, value)
      } else {
        this.cookies.delete(name)
      }
    }
  }

  clear(): void {
    this.cookies.clear()
  }

  get(name: string): string | undefined {
    return this.cookies.get(name)
  }

  set(name: string, value: string): void {
    this.cookies.set(name, value)
  }

  toHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ')
  }
}

function getSetCookieHeaders(headers: Headers): string[] {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie()
  }

  const single = headers.get('set-cookie')
  return single ? splitCombinedSetCookieHeader(single) : []
}

function splitCombinedSetCookieHeader(header: string): string[] {
  const parts = header.split(/,(?=\s*[^;,=\s]+=[^;,]+)/)
  return parts.flatMap(part => (part.trim() ? [part.trim()] : []))
}
