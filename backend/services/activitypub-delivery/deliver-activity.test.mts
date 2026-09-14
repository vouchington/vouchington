import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UnsafeUrlError } from 'ssrf-guard/node'
import { generateRsaSha256KeyPair } from '@modules/http-signatures'
import { deliverActivityToInbox } from './deliver-activity.mts'

const INBOX_URL = 'https://remote.example/users/alice/inbox'
const KEY_ID = 'https://voucha.test/ap/users/user-1#main-key'
const { privateKeyPem } = generateRsaSha256KeyPair()

function okResponse(): Response {
  return new Response(null, { status: 202 })
}

function responseWithRejectedCancellation(error: Error): Response {
  return new Response(
    new ReadableStream({
      cancel() {
        return Promise.reject(error)
      },
    }),
    { status: 500 },
  )
}

describe('deliverActivityToInbox', () => {
  const validateUrl = vi.fn<VitestLooseMock>()
  const fetch = vi.fn<VitestLooseMock>()

  beforeEach(() => {
    vi.clearAllMocks()
    validateUrl.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    fetch.mockResolvedValue(okResponse())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('signs and POSTs the activity JSON to the inbox', async () => {
    await deliverActivityToInbox(
      {
        inboxUrl: INBOX_URL,
        activity: { type: 'Follow' },
        keyId: KEY_ID,
        privateKeyPem,
      },
      { validateUrl, fetch },
    )

    expect(validateUrl).toHaveBeenCalledWith(INBOX_URL, { timeoutMs: expect.any(Number) })
    const [, dnsOptions] = validateUrl.mock.calls[0] as [string, { timeoutMs: number }]
    expect(dnsOptions.timeoutMs).toBeGreaterThan(0)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, options] = fetch.mock.calls[0]!
    expect(url).toBe(INBOX_URL)
    expect(options.method).toBe('POST')
    expect(options.body).toBe(JSON.stringify({ type: 'Follow' }))
    expect(options.headers['Content-Type']).toBe('application/activity+json')
    expect(options.headers.signature).toContain(`keyId="${KEY_ID}"`)
    expect(options.headers.digest).toBeTruthy()
    expect(options.headers.date).toBeTruthy()
  })

  it('rejects an SSRF-unsafe inbox URL without fetching', async () => {
    validateUrl.mockRejectedValueOnce(
      new UnsafeUrlError('https://internal.local/inbox', 'IP address is private'),
    )

    await expect(
      deliverActivityToInbox(
        { inboxUrl: 'https://internal.local/inbox', activity: {}, keyId: KEY_ID, privateKeyPem },
        { validateUrl, fetch },
      ),
    ).rejects.toThrow(/unsafe/i)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('throws on a rate-limit (429) response', async () => {
    fetch.mockResolvedValueOnce(
      new Response(null, { status: 429, headers: { 'retry-after': '30' } }),
    )

    await expect(
      deliverActivityToInbox(
        { inboxUrl: INBOX_URL, activity: {}, keyId: KEY_ID, privateKeyPem },
        { validateUrl, fetch },
      ),
    ).rejects.toThrow(/rate limited/i)
  })

  it('throws on a server error (500) response', async () => {
    fetch.mockResolvedValueOnce(new Response(null, { status: 500 }))

    await expect(
      deliverActivityToInbox(
        { inboxUrl: INBOX_URL, activity: {}, keyId: KEY_ID, privateKeyPem },
        { validateUrl, fetch },
      ),
    ).rejects.toThrow(/server error/i)
  })

  it('reports a failed best-effort body cancellation without replacing the delivery failure', async () => {
    const cancellationError = new Error('response body cancellation failed')
    const reportError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('NODE_ENV', 'development')
    fetch.mockResolvedValueOnce(responseWithRejectedCancellation(cancellationError))

    await expect(
      deliverActivityToInbox(
        { inboxUrl: INBOX_URL, activity: {}, keyId: KEY_ID, privateKeyPem },
        { validateUrl, fetch },
      ),
    ).rejects.toThrow(/server error/i)
    await new Promise<void>(queueMicrotask)

    expect(reportError).toHaveBeenCalledWith(cancellationError)
  })

  it('throws on a permanent client error (410 Gone) response', async () => {
    fetch.mockResolvedValueOnce(new Response(null, { status: 410 }))

    await expect(
      deliverActivityToInbox(
        { inboxUrl: INBOX_URL, activity: {}, keyId: KEY_ID, privateKeyPem },
        { validateUrl, fetch },
      ),
    ).rejects.toThrow(/410/)
  })

  it('does not throw on a 2xx response', async () => {
    fetch.mockResolvedValueOnce(new Response(null, { status: 200 }))

    await expect(
      deliverActivityToInbox(
        { inboxUrl: INBOX_URL, activity: {}, keyId: KEY_ID, privateKeyPem },
        { validateUrl, fetch },
      ),
    ).resolves.toBeUndefined()
  })

  it('keeps a DNS resolution timeout status-less and retryable, unlike an SSRF-unsafe rejection', async () => {
    const dnsTimeout = Object.assign(new Error('aborted'), { name: 'AbortError' })
    validateUrl.mockRejectedValueOnce(dnsTimeout)

    let caught: unknown
    try {
      await deliverActivityToInbox(
        { inboxUrl: INBOX_URL, activity: {}, keyId: KEY_ID, privateKeyPem },
        { validateUrl, fetch },
      )
    } catch (error) {
      caught = error
    }

    expect(caught).toBe(dnsTimeout)
    expect(caught).not.toHaveProperty('status')
    expect(fetch).not.toHaveBeenCalled()
  })
})
