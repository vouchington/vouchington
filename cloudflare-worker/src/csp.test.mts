import { describe, it, expect } from 'vitest'
import { buildWebCsp, normalizeAssetOrigin, REGISTERED_WEB_CSP_ORIGINS } from './csp.mts'

const BROWSER_UPLOAD_ORIGINS = JSON.stringify([
  'https://test-images.s3.us-west-2.amazonaws.com',
  'https://test-images.s3.dualstack.us-west-2.amazonaws.com',
])

const buildTestWebCsp = (
  assetOrigin?: string,
  options: { production?: boolean; nonce?: string } = {},
): string =>
  buildWebCsp(assetOrigin, {
    ...options,
    browserUploadOrigins: BROWSER_UPLOAD_ORIGINS,
    nonce: options.nonce ?? 'testnonce',
  })

function parseDirectives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split('; ').map(directive => {
      const [name, ...values] = directive.split(' ')
      return [name!, values]
    }),
  )
}

describe('normalizeAssetOrigin', () => {
  it('returns empty string for undefined or empty input', () => {
    expect(normalizeAssetOrigin(undefined)).toBe('')
    expect(normalizeAssetOrigin('')).toBe('')
    expect(normalizeAssetOrigin('  ')).toBe('')
  })

  it('returns the https origin (strips path/query/hash)', () => {
    expect(normalizeAssetOrigin('https://cdn.example.com')).toBe('https://cdn.example.com')
    expect(normalizeAssetOrigin('https://cdn.example.com/')).toBe('https://cdn.example.com')
    expect(normalizeAssetOrigin('https://cdn.example.com/path?q=1#hash')).toBe(
      'https://cdn.example.com',
    )
  })

  it('trims whitespace before validating', () => {
    expect(normalizeAssetOrigin('  https://cdn.example.com  ')).toBe('https://cdn.example.com')
  })

  it('rejects non-https non-localhost URLs', () => {
    expect(normalizeAssetOrigin('http://cdn.example.com')).toBe('')
    expect(normalizeAssetOrigin('ftp://cdn.example.com')).toBe('')
  })

  it('accepts http://localhost origins for local dev', () => {
    expect(normalizeAssetOrigin('http://localhost:3000')).toBe('http://localhost:3000')
    expect(normalizeAssetOrigin('http://localhost:53220')).toBe('http://localhost:53220')
    expect(normalizeAssetOrigin('http://localhost:3000/')).toBe('http://localhost:3000')
    expect(normalizeAssetOrigin('http://localhost:3000/path?q=1#hash')).toBe(
      'http://localhost:3000',
    )
  })

  it('rejects http://127.0.0.1 and other non-localhost HTTP origins', () => {
    expect(normalizeAssetOrigin('http://127.0.0.1:3000')).toBe('')
    expect(normalizeAssetOrigin('http://0.0.0.0:3000')).toBe('')
  })

  it('returns empty string for malformed URLs', () => {
    expect(normalizeAssetOrigin('not-a-url')).toBe('')
    expect(normalizeAssetOrigin('cdn.example.com')).toBe('')
  })
})

describe('buildWebCsp', () => {
  it('returns a semicolon-separated CSP string with all directives', () => {
    const csp = buildTestWebCsp()
    const directives = csp.split('; ')

    expect(directives).toContainEqual(expect.stringMatching(/^default-src /))
    expect(directives).toContainEqual(expect.stringMatching(/^script-src /))
    expect(directives).toContainEqual(expect.stringMatching(/^style-src /))
    expect(directives).toContainEqual(expect.stringMatching(/^img-src /))
    expect(directives).toContainEqual(expect.stringMatching(/^font-src /))
    expect(directives).toContainEqual(expect.stringMatching(/^frame-src /))
    expect(directives).toContainEqual(expect.stringMatching(/^connect-src /))
    expect(directives).toContainEqual(expect.stringMatching(/^object-src /))
    expect(directives).toContainEqual(expect.stringMatching(/^base-uri /))
    expect(directives).toContainEqual(expect.stringMatching(/^form-action /))
    expect(directives).toContainEqual(expect.stringMatching(/^frame-ancestors /))
  })

  it("includes 'self' in default-src", () => {
    const csp = buildTestWebCsp()
    expect(csp).toContain("default-src 'self'")
  })

  it('includes GTM origin in script-src, frame-src, and connect-src', () => {
    const csp = buildTestWebCsp()
    expect(csp).toMatch(/script-src [^;]*https:\/\/g\.voucha\.ai/)
    expect(csp).toMatch(/frame-src [^;]*https:\/\/g\.voucha\.ai/)
    expect(csp).toMatch(/connect-src [^;]*https:\/\/g\.voucha\.ai/)
  })

  it('includes Turnstile origin in script-src, frame-src, and connect-src', () => {
    const csp = buildTestWebCsp()
    expect(csp).toMatch(/script-src [^;]*https:\/\/challenges\.cloudflare\.com/)
    expect(csp).toMatch(/frame-src [^;]*https:\/\/challenges\.cloudflare\.com/)
    expect(csp).toMatch(/connect-src [^;]*https:\/\/challenges\.cloudflare\.com/)
  })

  it('includes OAuth SDK origins in script-src and connect-src', () => {
    const csp = buildTestWebCsp()
    expect(csp).toMatch(/script-src [^;]*https:\/\/connect\.facebook\.net/)
    expect(csp).toMatch(/script-src [^;]*https:\/\/accounts\.google\.com/)
    expect(csp).toMatch(/script-src [^;]*https:\/\/appleid\.cdn-apple\.com/)
    expect(csp).toMatch(/connect-src [^;]*https:\/\/connect\.facebook\.net/)
    expect(csp).toMatch(/connect-src [^;]*https:\/\/accounts\.google\.com/)
    expect(csp).toMatch(/connect-src [^;]*https:\/\/appleid\.cdn-apple\.com/)
  })

  it('includes Facebook Graph API and impression tracking in connect-src', () => {
    const csp = buildTestWebCsp()
    expect(csp).toMatch(/connect-src [^;]*https:\/\/graph\.facebook\.com/)
    expect(csp).toMatch(/connect-src [^;]*https:\/\/www\.facebook\.com/)
  })

  it('includes HN Algolia search in connect-src', () => {
    const csp = buildTestWebCsp()
    expect(csp).toMatch(/connect-src [^;]*https:\/\/hn\.algolia\.com/)
  })

  it('includes accounts.google.com in frame-src for Google One Tap iframe', () => {
    const csp = buildTestWebCsp()
    expect(csp).toMatch(/frame-src [^;]*https:\/\/accounts\.google\.com/)
  })

  it('includes reCAPTCHA Enterprise origins in script-src, connect-src, and frame-src', () => {
    const csp = buildTestWebCsp()
    // enterprise.js loads from www.google.com; static helpers from gstatic.com
    expect(csp).toMatch(/script-src [^;]*https:\/\/www\.google\.com/)
    expect(csp).toMatch(/script-src [^;]*https:\/\/www\.gstatic\.com/)
    // token-minting POST and challenge iframe
    expect(csp).toMatch(/connect-src [^;]*https:\/\/www\.google\.com/)
    expect(csp).toMatch(/frame-src [^;]*https:\/\/www\.google\.com/)
  })

  it('includes every registered third-party origin in its required directives', () => {
    const directives = parseDirectives(buildTestWebCsp())

    for (const { origin, directives: requiredDirectives } of REGISTERED_WEB_CSP_ORIGINS) {
      for (const directive of requiredDirectives) {
        expect(directives.get(directive)).toContain(origin)
      }
    }
  })

  it('keeps every explicit third-party origin in the generated CSP registered', () => {
    const registeredOrigins = new Set(REGISTERED_WEB_CSP_ORIGINS.map(entry => entry.origin))
    for (const origin of JSON.parse(BROWSER_UPLOAD_ORIGINS) as string[])
      registeredOrigins.add(origin)
    const origins = buildTestWebCsp().match(/https:\/\/[^\s;]+/g) ?? []

    expect(origins.filter(origin => !registeredOrigins.has(origin))).toEqual([])
  })

  it('includes pinned Sentry ingest hostname in connect-src (not wildcard)', () => {
    const csp = buildTestWebCsp()
    expect(csp).toMatch(/connect-src [^;]*https:\/\/o4507688154824704\.ingest\.us\.sentry\.io/)
    expect(csp).not.toContain('*.ingest.sentry.io')
  })

  it('includes only the injected S3 upload origins', () => {
    const connectSrc = parseDirectives(buildTestWebCsp()).get('connect-src')
    expect(connectSrc).toContain('https://test-images.s3.us-west-2.amazonaws.com')
    expect(connectSrc).toContain('https://test-images.s3.dualstack.us-west-2.amazonaws.com')
    expect(connectSrc).not.toContain('https://*.s3.us-west-2.amazonaws.com')
    expect(connectSrc).not.toContain('https://*.s3.dualstack.us-west-2.amazonaws.com')
  })

  it('includes CloudFront image-delivery hosts in img-src', () => {
    const csp = buildTestWebCsp()
    expect(csp).toMatch(/img-src [^;]*https:\/\/images-staging\.voucha\.ai/)
    expect(csp).toMatch(/img-src [^;]*https:\/\/images\.voucha\.ai/)
  })

  it('does not include CloudFront image-delivery hosts in connect-src', () => {
    const csp = buildTestWebCsp()
    expect(csp).not.toMatch(/connect-src [^;]*https:\/\/images-staging\.voucha\.ai/)
    expect(csp).not.toMatch(/connect-src [^;]*https:\/\/images\.voucha\.ai\b/)
  })

  it("blocks plugins with object-src 'none'", () => {
    const csp = buildTestWebCsp()
    expect(csp).toContain("object-src 'none'")
  })

  it("includes frame-ancestors 'self' for clickjacking protection", () => {
    const csp = buildTestWebCsp()
    expect(csp).toContain("frame-ancestors 'self'")
  })

  it('does not include asset origin when omitted', () => {
    const csp = buildTestWebCsp()
    // No trailing whitespace or double spaces from empty asset origin
    expect(csp).not.toMatch(/ {2}/)
  })

  it('does not include asset origin when empty string', () => {
    const csp = buildTestWebCsp('')
    expect(csp).not.toMatch(/ {2}/)
  })

  it('includes asset origin in script-src, style-src, img-src, and font-src when provided', () => {
    const csp = buildTestWebCsp('https://cdn.example.com')
    expect(csp).toMatch(/script-src [^;]*https:\/\/cdn\.example\.com/)
    expect(csp).toMatch(/style-src [^;]*https:\/\/cdn\.example\.com/)
    expect(csp).toMatch(/img-src [^;]*https:\/\/cdn\.example\.com/)
    expect(csp).toMatch(/font-src [^;]*https:\/\/cdn\.example\.com/)
  })

  it('includes asset origin in connect-src for source maps and dev overlay', () => {
    const csp = buildTestWebCsp('https://cdn.example.com')
    expect(csp).toMatch(/connect-src [^;]*https:\/\/cdn\.example\.com/)
  })

  it('does not include asset origin in frame-src', () => {
    const csp = buildTestWebCsp('https://cdn.example.com')
    expect(csp).not.toMatch(/frame-src [^;]*https:\/\/cdn\.example\.com/)
  })

  it('strips path/query/hash from asset origin', () => {
    const csp = buildTestWebCsp('https://cdn.example.com/some/path?query=1#hash')
    expect(csp).toMatch(/script-src [^;]*https:\/\/cdn\.example\.com(?!\/)/)
    expect(csp).not.toContain('/some/path')
  })

  it('rejects http asset origins for non-localhost hosts', () => {
    const csp = buildTestWebCsp('http://cdn.example.com')
    expect(csp).not.toContain('cdn.example.com')
  })

  it('accepts http://localhost asset origin for local dev', () => {
    const csp = buildTestWebCsp('http://localhost:3000')
    expect(csp).toMatch(/script-src [^;]*http:\/\/localhost:3000/)
    expect(csp).toMatch(/style-src [^;]*http:\/\/localhost:3000/)
    expect(csp).toMatch(/font-src [^;]*http:\/\/localhost:3000/)
    expect(csp).toMatch(/connect-src [^;]*http:\/\/localhost:3000/)
  })

  it('ignores whitespace-only or malformed asset origins', () => {
    expect(buildTestWebCsp('  ')).not.toMatch(/ {2}/)
    expect(buildTestWebCsp('not-a-url')).not.toContain('not-a-url')
  })

  it('allows images from self, data URIs, and HTTPS origins', () => {
    const csp = buildTestWebCsp()
    expect(csp).toMatch(/img-src 'self' data:/)
    expect(csp).toMatch(/img-src [^;]* https:/)
  })

  it('allows http: in img-src when production is false (local dev image lambda)', () => {
    const csp = buildTestWebCsp(undefined, { production: false })
    expect(csp).toMatch(/img-src [^;]* http: /)
  })

  it('does NOT allow http: in img-src when production is true', () => {
    const csp = buildTestWebCsp(undefined, { production: true })
    expect(csp).not.toMatch(/img-src [^;]* http: /)
  })

  it("does NOT include 'unsafe-eval' when production is true", () => {
    const csp = buildTestWebCsp(undefined, { production: true })
    expect(csp).not.toContain("'unsafe-eval'")
  })

  it("includes 'unsafe-eval' in script-src when production is false", () => {
    const csp = buildTestWebCsp(undefined, { production: false })
    expect(csp).toMatch(/script-src [^;]*'unsafe-eval'/)
  })

  it("includes nonce in script CSP without the ignored 'unsafe-inline' fallback", () => {
    const csp = buildTestWebCsp(undefined, { production: true, nonce: 'abc123' })
    expect(csp).toMatch(/script-src [^;]*'nonce-abc123'/)
    expect(csp).not.toMatch(/script-src [^;]*'unsafe-inline'/)
  })

  it('allows nonce-bearing inline speculation rules in script-src', () => {
    const csp = buildTestWebCsp(undefined, { production: true, nonce: 'abc123' })
    expect(csp).toMatch(/script-src [^;]*'inline-speculation-rules'/)
  })

  it("does NOT include 'unsafe-eval' when production is omitted (production-safe default)", () => {
    const csp = buildTestWebCsp()
    expect(csp).not.toContain("'unsafe-eval'")
  })
})
