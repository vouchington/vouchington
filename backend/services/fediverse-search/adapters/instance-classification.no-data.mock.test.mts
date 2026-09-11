import { describe, it, expect, vi, beforeEach } from 'vitest'
import { classifyFediverseInstance } from './instance-classification.mts'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'
import { FEDIVERSE_MASTODON_HOST } from '@voucha/config'

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

const HOST = FEDIVERSE_MASTODON_HOST
const NODEINFO_URL = `https://${HOST}/nodeinfo/2.0`

const WELL_KNOWN_DOCUMENT = {
  links: [{ rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0', href: NODEINFO_URL }],
}

const NODEINFO_DOCUMENT = {
  version: '2.0',
  software: { name: 'mastodon', version: '4.2.1' },
  protocols: ['activitypub'],
  openRegistrations: true,
  usage: { users: { total: 1000, activeMonth: 250 } },
}

function requestedUrl(callIndex: number): URL {
  const requestUrl = fetchSpy.mock.calls[callIndex]?.[0]
  return requestUrl instanceof URL ? requestUrl : new URL(String(requestUrl))
}

describe('classifyFediverseInstance', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    fetchSpy.mockReset()
  })

  it('returns unsupported_host and makes no fetch calls for a host outside the configured allowlist', async () => {
    const result = await classifyFediverseInstance('evil.example')

    expect(result).toEqual({ status: 'error', error_code: 'unsupported_host' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('follows the well-known document to the schema 2.0 link and maps the resulting NodeInfo document', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(WELL_KNOWN_DOCUMENT), { status: 200 }),
    )
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(NODEINFO_DOCUMENT), { status: 200 }))

    const result = await classifyFediverseInstance(HOST)

    expect(result).toEqual({
      status: 'ok',
      metadata: {
        software: 'mastodon',
        protocol: 'activitypub',
        nodeinfo_software_version: '4.2.1',
        total_users: 1000,
        monthly_active_users: 250,
        open_registrations: true,
        nodeinfo_raw: NODEINFO_DOCUMENT,
      },
    })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(requestedUrl(0).href).toBe(`https://${HOST}/.well-known/nodeinfo`)
    expect(requestedUrl(1).href).toBe(NODEINFO_URL)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dispatcher: getExternalRequestDispatcher() }),
    )
  })

  it('degrades to provider_error without a second fetch when the well-known document has no schema 2.0 link', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ links: [] }), { status: 200 }))

    const result = await classifyFediverseInstance(HOST)

    expect(result).toEqual({ status: 'error', error_code: 'provider_error' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('degrades to provider_error without a second fetch when the schema 2.0 link points off-host', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          links: [
            {
              rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0',
              href: 'https://attacker.example/nodeinfo/2.0',
            },
          ],
        }),
        { status: 200 },
      ),
    )

    const result = await classifyFediverseInstance(HOST)

    expect(result).toEqual({ status: 'error', error_code: 'provider_error' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('degrades to provider_error on a non-ok well-known response', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 500 }))

    const result = await classifyFediverseInstance(HOST)

    expect(result).toEqual({ status: 'error', error_code: 'provider_error' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('degrades to provider_error on a non-ok nodeinfo document response', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(WELL_KNOWN_DOCUMENT), { status: 200 }),
    )
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 404 }))

    const result = await classifyFediverseInstance(HOST)

    expect(result).toEqual({ status: 'error', error_code: 'provider_error' })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('degrades to provider_error on an aborted/timed-out request', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    fetchSpy.mockRejectedValueOnce(abortError)

    const result = await classifyFediverseInstance(HOST)

    expect(result).toEqual({ status: 'error', error_code: 'provider_error' })
  })
})
