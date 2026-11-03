import dns from 'node:dns'
import undici from 'undici'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
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
  let lookup: MockInstance<typeof dns.promises.lookup>
  let fetch: MockInstance<typeof undici.fetch>

  beforeEach(() => {
    lookup = vi.spyOn(dns.promises, 'lookup')
    fetch = vi.spyOn(undici, 'fetch')
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never)
    fetch.mockResolvedValue(okResponse() as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('signs and POSTs the activity JSON to the inbox', async () => {
    await deliverActivityToInbox({
      inboxUrl: INBOX_URL,
      activity: { type: 'Follow' },
      keyId: KEY_ID,
      privateKeyPem,
    })

    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup.mock.calls[0]![0]).toBe('remote.example')
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, options] = fetch.mock.calls[0] as [string, Record<string, any>]
    expect(url).toBe(INBOX_URL)
    expect(options.method).toBe('POST')
    expect(options.body).toBe(JSON.stringify({ type: 'Follow' }))
    expect(options.headers['Content-Type']).toBe('application/activity+json')
    expect(options.headers.signature).toContain(`keyId="${KEY_ID}"`)
    expect(options.headers.signature).toContain('algorithm="rsa-sha256"')
    expect(options.headers.signature).toContain('headers="(request-target) host date digest"')
    expect(options.headers.digest).toBeTruthy()
    expect(options.headers.date).toBeTruthy()
  })

  it('rejects an SSRF-unsafe inbox URL without fetching', async () => {
    await expect(
      deliverActivityToInbox({
        inboxUrl: 'https://10.0.0.1/inbox',
        activity: {},
        keyId: KEY_ID,
        privateKeyPem,
      }),
    ).rejects.toThrow(/unsafe/i)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('throws on a rate-limit (429) response', async () => {
    fetch.mockResolvedValueOnce(
      new Response(null, { status: 429, headers: { 'retry-after': '30' } }) as never,
    )

    await expect(
      deliverActivityToInbox({ inboxUrl: INBOX_URL, activity: {}, keyId: KEY_ID, privateKeyPem }),
    ).rejects.toThrow(/rate limited/i)
  })

  it('throws on a server error (500) response', async () => {
    fetch.mockResolvedValueOnce(new Response(null, { status: 500 }) as never)

    await expect(
      deliverActivityToInbox({ inboxUrl: INBOX_URL, activity: {}, keyId: KEY_ID, privateKeyPem }),
    ).rejects.toThrow(/server error/i)
  })

  it('reports a failed best-effort body cancellation without replacing the delivery failure', async () => {
    const cancellationError = new Error('response body cancellation failed')
    const reportError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('NODE_ENV', 'development')
    fetch.mockResolvedValueOnce(responseWithRejectedCancellation(cancellationError) as never)

    await expect(
      deliverActivityToInbox({ inboxUrl: INBOX_URL, activity: {}, keyId: KEY_ID, privateKeyPem }),
    ).rejects.toThrow(/server error/i)
    await new Promise<void>(queueMicrotask)

    expect(reportError).toHaveBeenCalledWith(cancellationError)
  })

  it('throws on a permanent client error (410 Gone) response', async () => {
    fetch.mockResolvedValueOnce(new Response(null, { status: 410 }) as never)

    await expect(
      deliverActivityToInbox({ inboxUrl: INBOX_URL, activity: {}, keyId: KEY_ID, privateKeyPem }),
    ).rejects.toThrow(/410/)
  })

  it('does not throw on a 2xx response', async () => {
    fetch.mockResolvedValueOnce(new Response(null, { status: 200 }) as never)

    await expect(
      deliverActivityToInbox({ inboxUrl: INBOX_URL, activity: {}, keyId: KEY_ID, privateKeyPem }),
    ).resolves.toBeUndefined()
  })

  it('keeps a DNS resolution timeout status-less and retryable, unlike an SSRF-unsafe rejection', async () => {
    const dnsTimeout = Object.assign(new Error('aborted'), { name: 'AbortError' })
    lookup.mockRejectedValueOnce(dnsTimeout)

    let caught: unknown
    try {
      await deliverActivityToInbox({
        inboxUrl: INBOX_URL,
        activity: {},
        keyId: KEY_ID,
        privateKeyPem,
      })
    } catch (err) {
      caught = err
    }

    expect(caught).toBe(dnsTimeout)
    expect(caught).not.toHaveProperty('status')
    expect(fetch).not.toHaveBeenCalled()
  })
})
