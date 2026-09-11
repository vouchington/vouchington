import { describe, expect, it, vi } from 'vitest'
import { dispatchToCachedOrigin, type CacheDispatchInput } from '../cache-dispatch.mts'
import type { EdgeExecutionContext, Env } from '../types.mts'

// dispatchToCachedOrigin never calls .purge — these tests only exercise .fetch — so a
// stub that's never invoked satisfies EdgeExecutionContext's shape.
const unusedPurge = () => Promise.reject(new Error('purge unexpectedly called in this test'))

const buildContext = (
  fetchImpl: (request: Request) => Promise<Response>,
): EdgeExecutionContext => ({
  waitUntil: () => {},
  exports: {
    CachedOrigin: {
      fetch: vi.fn<VitestLooseMock>((request: Request) => fetchImpl(request)),
      purge: unusedPurge,
    },
  },
})

const baseInput = (
  overrides: Partial<CacheDispatchInput> = {},
): CacheDispatchInput & { context: EdgeExecutionContext } => ({
  audience: 'anon',
  botTier: null,
  context: buildContext(() => Promise.resolve(new Response('ok'))),
  cspNonce: 'real-per-request-nonce',
  dispatchUrl: new URL('https://voucha.ai/api/v1/posts'),
  edgeSession: { kind: 'anon-passthrough' },
  env: {} as Env,
  ip: null,
  isProduction: false,
  isRsc: false,
  method: 'GET',
  requestId: 'test-request-id',
  target: 'backend',
  ...overrides,
})

describe('dispatchToCachedOrigin', () => {
  it('sends only x-request-id when there is no bot-tier signal to relay', async () => {
    let capturedRequest: Request | undefined
    const context = buildContext(request => {
      capturedRequest = request
      return Promise.resolve(new Response('ok'))
    })

    await dispatchToCachedOrigin(
      baseInput({
        context,
        dispatchUrl: new URL('https://voucha.ai/api/v1/posts'),
        method: 'GET',
        requestId: 'test-request-id',
      }),
    )

    expect(capturedRequest?.url).toBe('https://voucha.ai/api/v1/posts')
    expect(capturedRequest?.method).toBe('GET')
    expect(capturedRequest?.headers.get('cookie')).toBeNull()
    expect(capturedRequest?.headers.get('x-request-id')).toBe('test-request-id')
    expect(capturedRequest?.headers.get('accept-language')).toBe('en')
    expect([...(capturedRequest?.headers.entries() ?? [])]).toHaveLength(2)
  })

  it('relays bot tier and IP as headers only when botTier is "unknown" — never via props', async () => {
    let capturedRequest: Request | undefined
    let capturedProps: unknown
    const context: EdgeExecutionContext = {
      waitUntil: () => {},
      exports: {
        CachedOrigin: {
          fetch: (request: Request, init) => {
            capturedRequest = request
            capturedProps = init.props
            return Promise.resolve(new Response('ok'))
          },
          purge: unusedPurge,
        },
      },
    }

    await dispatchToCachedOrigin(baseInput({ context, botTier: 'unknown', ip: '1.2.3.4' }))

    expect(capturedRequest?.headers.get('x-voucha-dispatch-bot-tier')).toBe('unknown')
    expect(capturedRequest?.headers.get('x-voucha-dispatch-ip')).toBe('1.2.3.4')
    expect(capturedRequest?.headers.get('accept-language')).toBe('en')
    expect([...(capturedRequest?.headers.entries() ?? [])]).toHaveLength(4)
    expect(capturedProps).toEqual({ audience: 'anon', isRsc: false })
  })

  it('omits the IP header when botTier is "unknown" but ip is null', async () => {
    let capturedRequest: Request | undefined
    const context = buildContext(request => {
      capturedRequest = request
      return Promise.resolve(new Response('ok'))
    })

    await dispatchToCachedOrigin(baseInput({ context, botTier: 'unknown', ip: null }))

    expect(capturedRequest?.headers.get('x-voucha-dispatch-bot-tier')).toBe('unknown')
    expect(capturedRequest?.headers.get('x-voucha-dispatch-ip')).toBeNull()
  })

  it('sends the IP header for a known bot too, but no bot-tier header (bot-tier gate is unknown-only)', async () => {
    let capturedRequest: Request | undefined
    const context = buildContext(request => {
      capturedRequest = request
      return Promise.resolve(new Response('ok'))
    })

    await dispatchToCachedOrigin(baseInput({ context, botTier: 'known', ip: '1.2.3.4' }))

    expect(capturedRequest?.headers.get('x-voucha-dispatch-bot-tier')).toBeNull()
    expect(capturedRequest?.headers.get('x-voucha-dispatch-ip')).toBe('1.2.3.4')
    expect(capturedRequest?.headers.get('accept-language')).toBe('en')
    expect([...(capturedRequest?.headers.entries() ?? [])]).toHaveLength(3)
  })

  it('relays the IP header for ordinary (non-bot) traffic too, since IP relay is not bot-gated', async () => {
    let capturedRequest: Request | undefined
    const context = buildContext(request => {
      capturedRequest = request
      return Promise.resolve(new Response('ok'))
    })

    await dispatchToCachedOrigin(baseInput({ context, botTier: null, ip: '5.6.7.8' }))

    expect(capturedRequest?.headers.get('x-voucha-dispatch-bot-tier')).toBeNull()
    expect(capturedRequest?.headers.get('x-voucha-dispatch-ip')).toBe('5.6.7.8')
    expect([...(capturedRequest?.headers.entries() ?? [])]).toHaveLength(3)
  })

  it('relays the gateway request ID as x-request-id for backend trace correlation', async () => {
    let capturedRequest: Request | undefined
    const context = buildContext(request => {
      capturedRequest = request
      return Promise.resolve(new Response('ok'))
    })

    await dispatchToCachedOrigin(baseInput({ context, requestId: 'client-visible-id' }))

    expect(capturedRequest?.headers.get('x-request-id')).toBe('client-visible-id')
  })

  it('threads audience and isRsc through as ctx.props', async () => {
    let capturedProps: unknown
    const context: EdgeExecutionContext = {
      waitUntil: () => {},
      exports: {
        CachedOrigin: {
          fetch: (_request, init) => {
            capturedProps = init.props
            return Promise.resolve(new Response('ok'))
          },
          purge: unusedPurge,
        },
      },
    }

    await dispatchToCachedOrigin(baseInput({ context, audience: 'bot', isRsc: true }))

    expect(capturedProps).toEqual({ audience: 'bot', isRsc: true })
  })

  it('includes lang in ctx.props only when provided (anon UI-locale partition, #6994)', async () => {
    let capturedRequest: Request | undefined
    let capturedProps: unknown
    const context: EdgeExecutionContext = {
      waitUntil: () => {},
      exports: {
        CachedOrigin: {
          fetch: (request, init) => {
            capturedRequest = request
            capturedProps = init.props
            return Promise.resolve(new Response('ok'))
          },
          purge: unusedPurge,
        },
      },
    }

    await dispatchToCachedOrigin(baseInput({ context, lang: 'en' }))

    expect(capturedProps).toEqual({ audience: 'anon', isRsc: false, lang: 'en' })
    expect(capturedRequest?.headers.get('accept-language')).toBe('en')
  })

  it('composes lang and isRsc independently in ctx.props (locale + RSC partition, #6994)', async () => {
    let capturedRequest: Request | undefined
    let capturedProps: unknown
    const context: EdgeExecutionContext = {
      waitUntil: () => {},
      exports: {
        CachedOrigin: {
          fetch: (request, init) => {
            capturedRequest = request
            capturedProps = init.props
            return Promise.resolve(new Response('ok'))
          },
          purge: unusedPurge,
        },
      },
    }

    await dispatchToCachedOrigin(baseInput({ context, isRsc: true, lang: 'en' }))

    expect(capturedProps).toEqual({ audience: 'anon', isRsc: true, lang: 'en' })
    expect(capturedRequest?.headers.get('accept-language')).toBe('en')
  })

  it('rewrites the placeholder nonce only for target === "web"', async () => {
    const bodyWithPlaceholder = '<script nonce="placeholder-secret-safely-over-32-chars"></script>'
    const context = buildContext(() =>
      Promise.resolve(
        new Response(bodyWithPlaceholder, { headers: { 'content-type': 'text/html' } }),
      ),
    )

    const webResponse = await dispatchToCachedOrigin(
      baseInput({
        context,
        target: 'web',
        cspNonce: 'fresh-real-nonce',
        env: { CACHE_PLACEHOLDER_NONCE: 'placeholder-secret-safely-over-32-chars' } as Env,
      }),
    )
    expect(await webResponse.text()).toBe('<script nonce="fresh-real-nonce"></script>')

    const backendResponse = await dispatchToCachedOrigin(
      baseInput({
        context: buildContext(() => Promise.resolve(new Response(bodyWithPlaceholder))),
        target: 'backend',
        cspNonce: 'fresh-real-nonce',
        env: { CACHE_PLACEHOLDER_NONCE: 'placeholder-secret-safely-over-32-chars' } as Env,
      }),
    )
    expect(await backendResponse.text()).toBe(bodyWithPlaceholder)
  })

  it('sets x-voucha-cache: DISPATCHED and a server-timing header measuring dispatch duration', async () => {
    const response = await dispatchToCachedOrigin(baseInput())

    expect(response.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(response.headers.get('server-timing')).toMatch(/^origin;dur=\d+$/)
  })

  it('applies no-store failure headers on a >=400 dispatched response', async () => {
    const context = buildContext(() => Promise.resolve(new Response('error', { status: 500 })))

    const response = await dispatchToCachedOrigin(baseInput({ context }))

    expect(response.status).toBe(500)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate')
  })

  it('applies minted session cookies from an anon-minted edge session', async () => {
    const response = await dispatchToCachedOrigin(
      baseInput({
        edgeSession: {
          kind: 'anon-minted',
          dt: 'device-token',
          st: 'session-token',
          mintedDt: true,
          mintedSt: true,
        },
        isProduction: true,
      }),
    )

    const setCookies = response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie')]
    expect(setCookies.some(cookie => cookie?.startsWith('dt=device-token'))).toBe(true)
    expect(setCookies.some(cookie => cookie?.startsWith('st=session-token'))).toBe(true)
  })

  it('does not add any cookies for an anon-passthrough edge session (bot/cacheable dispatch)', async () => {
    const response = await dispatchToCachedOrigin(
      baseInput({ edgeSession: { kind: 'anon-passthrough' } }),
    )

    expect(response.headers.get('set-cookie')).toBeNull()
  })

  // request-handler.mts's canDispatchToCache only ever dispatches target==='web'
  // when CACHE_PLACEHOLDER_NONCE is configured, so this should be unreachable in
  // production. Covered here to document that the invariant is enforced
  // structurally: requireCachePlaceholderNonce throws rather than silently
  // falling through with '', which would otherwise let rewritePlaceholderNonce
  // insert the real nonce at every character boundary and corrupt the body.
  it('throws when the placeholder secret is unset (should be unreachable in practice)', async () => {
    const context = buildContext(() =>
      Promise.resolve(new Response('ab', { headers: { 'content-type': 'text/html' } })),
    )

    await expect(
      dispatchToCachedOrigin(baseInput({ context, target: 'web', cspNonce: 'N', env: {} as Env })),
    ).rejects.toThrow('CACHE_PLACEHOLDER_NONCE missing or too short')
  })
})
