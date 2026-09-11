import { describe, expect, it } from 'vitest'
import { rewritePlaceholderNonce } from '../nonce-rewrite.mts'

const PLACEHOLDER = 'PLACEHOLDER-NONCE-0123456789abcdef'
const REAL_NONCE = 'real-request-nonce-fedcba9876543210'

describe('rewritePlaceholderNonce', () => {
  it('replaces every placeholder occurrence, including the flight payload', async () => {
    const body = [
      `<script nonce="${PLACEHOLDER}">console.log(1)</script>`,
      `<script nonce="${PLACEHOLDER}">self.__next_f.push([1,"${PLACEHOLDER}"])</script>`,
    ].join('')
    const response = new Response(body, { headers: { 'content-type': 'text/html' } })

    const rewritten = await rewritePlaceholderNonce(response, PLACEHOLDER, REAL_NONCE)
    const text = await rewritten.text()

    expect(text).not.toContain(PLACEHOLDER)
    expect(text.match(new RegExp(REAL_NONCE, 'g'))).toHaveLength(3)
  })

  it('rewrites a nonce and strips a Sentry meta tag split across stream chunks', async () => {
    const encoder = new TextEncoder()
    const chunks = [
      `<meta name="sentry-`,
      `trace" content="trace"/><script nonce="${PLACEHOLDER.slice(0, 12)}`,
      `${PLACEHOLDER.slice(12)}"></script>`,
    ]
    const response = new Response(
      new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
          controller.close()
        },
      }),
    )

    const rewritten = await rewritePlaceholderNonce(response, PLACEHOLDER, REAL_NONCE)

    await expect(rewritten.text()).resolves.toBe(`<script nonce="${REAL_NONCE}"></script>`)
  })

  // Defense-in-depth deploy-safety net (see nonce-rewrite.mts's doc comment on
  // SENTRY_META_TAG_RE): guards the window where the Worker has shipped this strip but web
  // hasn't yet shipped the render-time suppression, so old web still emits these tags.
  it('strips sentry-trace/baggage meta tags in the same pass', async () => {
    const body = `<meta name="sentry-trace" content="t"/><script nonce="${PLACEHOLDER}"></script>`
    const response = new Response(body)

    const rewritten = await rewritePlaceholderNonce(response, PLACEHOLDER, REAL_NONCE)

    expect(await rewritten.text()).toBe(`<script nonce="${REAL_NONCE}"></script>`)
  })

  it('drops content-length so a nonce-length change cannot desync the response', async () => {
    const body = `<script nonce="${PLACEHOLDER}"></script>`
    const response = new Response(body, {
      headers: { 'content-length': String(body.length), 'content-type': 'text/html' },
    })

    const rewritten = await rewritePlaceholderNonce(response, PLACEHOLDER, REAL_NONCE)

    expect(rewritten.headers.get('content-length')).toBeNull()
    expect(rewritten.headers.get('content-type')).toBe('text/html')
  })

  it('drops content-length even when the nonce swap does not change body length', async () => {
    // A same-length substitution must still drop content-length unconditionally, not only
    // when the swap happens to change the byte count.
    const sameLengthReal = 'x'.repeat(PLACEHOLDER.length)
    const body = `<script nonce="${PLACEHOLDER}"></script>`
    const response = new Response(body, {
      headers: { 'content-length': String(body.length) },
    })

    const rewritten = await rewritePlaceholderNonce(response, PLACEHOLDER, sameLengthReal)

    expect(rewritten.headers.get('content-length')).toBeNull()
    expect(await rewritten.text()).toBe(`<script nonce="${sameLengthReal}"></script>`)
  })

  it('preserves status and statusText on error bodies while still rewriting them', async () => {
    const body = `<html><script nonce="${PLACEHOLDER}">handleError()</script></html>`
    const response = new Response(body, { status: 500, statusText: 'Internal Server Error' })

    const rewritten = await rewritePlaceholderNonce(response, PLACEHOLDER, REAL_NONCE)
    const text = await rewritten.text()

    expect(rewritten.status).toBe(500)
    expect(rewritten.statusText).toBe('Internal Server Error')
    expect(text).not.toContain(PLACEHOLDER)
    expect(text).toContain(REAL_NONCE)
  })

  it('returns the response unchanged when there is no body (e.g. a 204)', async () => {
    const response = new Response(null, { status: 204 })

    const result = await rewritePlaceholderNonce(response, PLACEHOLDER, REAL_NONCE)

    expect(result).toBe(response)
  })

  it('returns the response unchanged when the placeholder equals the real nonce', async () => {
    const response = new Response(`<script nonce="${REAL_NONCE}"></script>`)

    const result = await rewritePlaceholderNonce(response, REAL_NONCE, REAL_NONCE)

    expect(result).toBe(response)
  })

  // An empty placeholder would otherwise make text.split('').join(realNonce) insert
  // realNonce between every character of the body, corrupting it.
  it('returns the response unchanged when the placeholder is empty', async () => {
    const response = new Response('ab')

    const result = await rewritePlaceholderNonce(response, '', REAL_NONCE)

    expect(result).toBe(response)
  })

  // Fail-closed contract: if the placeholder actually stamped into the body no
  // longer matches the value the rewriter is told to look for (e.g. a secret
  // rotated mid-flight, or a rewrite call was skipped upstream), the stale
  // placeholder bytes must survive untouched rather than being silently
  // coerced into something that could match a freshly-built CSP header. The
  // header is always built independently with the real per-request nonce
  // (see index.mts), so a body that still carries a stale/placeholder value
  // disagrees with it — inline scripts are blocked (page broken), not opened.
  it('fail-closed: leaves a non-matching placeholder in the body untouched', async () => {
    const staleValue = 'STALE-PLACEHOLDER-FROM-BEFORE-ROTATION'
    const body = `<script nonce="${staleValue}"></script>`
    const response = new Response(body)

    const rewritten = await rewritePlaceholderNonce(response, PLACEHOLDER, REAL_NONCE)
    const text = await rewritten.text()

    expect(text).toBe(body)
    expect(text).not.toContain(REAL_NONCE)
  })

  it('emits an oversized malformed meta candidate before the source closes', async () => {
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    let sourceController: ReadableStreamDefaultController<Uint8Array> | undefined
    const candidate = `<meta${'x'.repeat(16 * 1024)}`
    const response = new Response(
      new ReadableStream({
        start(controller) {
          sourceController = controller
          controller.enqueue(encoder.encode(candidate))
        },
      }),
    )
    const rewritten = await rewritePlaceholderNonce(response, PLACEHOLDER, REAL_NONCE)
    const reader = rewritten.body!.getReader()

    const first = await reader.read()
    const firstText = decoder.decode(first.value)
    expect(firstText).toBe(candidate.slice(0, firstText.length))
    expect(firstText.length).toBeGreaterThan(16 * 1024)

    sourceController!.enqueue(encoder.encode('tail'))
    sourceController!.close()
    const second = await reader.read()
    expect(decoder.decode(second.value)).toBe(`${candidate.slice(firstText.length)}tail`)
    await expect(reader.read()).resolves.toMatchObject({ done: true })

    reader.releaseLock()
  })
})
