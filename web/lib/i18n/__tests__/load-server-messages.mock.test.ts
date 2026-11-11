import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadServerMessages, ssrLocalizationRevisionHtmlProps } from '../load-server-messages'
import { SSR_LOCALIZATION_REVISION_ATTRIBUTE } from '../ssr-localization-revision-props.mts'
import { ROUTE_SELECTORS, WEB_CHROME_SELECTOR } from '../route-selectors.generated.mts'

function exactSelectorsFor(pattern: string): string {
  const route = ROUTE_SELECTORS.find(entry => entry.pattern === pattern)
  if (!route) throw new Error(`Missing generated route ${pattern}`)
  return [WEB_CHROME_SELECTOR, route.selectorId].toSorted().join(',')
}

const { mockGetBatch, mockHeadersGet } = vi.hoisted(() => ({
  mockGetBatch: vi.fn<VitestLooseMock>(),
  mockHeadersGet: vi.fn<VitestLooseMock>(),
}))

function localizationBatch(title: string, ttlSeconds = 60) {
  return {
    contract: 'v1' as const,
    revision: `revision-${title}`,
    ttlSeconds,
    messages: { 'nav.home': title },
  }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

vi.mock(import('next/headers'), () => ({
  headers: vi.fn<VitestLooseMock>(async () => ({ get: mockHeadersGet })),
}))

vi.mock(import('@/lib/api/server/localization'), () => ({
  getWebLocalizationBatch: mockGetBatch,
}))

describe('loadServerMessages', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    mockGetBatch.mockReset()
    mockHeadersGet.mockReset()
    mockHeadersGet.mockReturnValue('/admin/ai-costs')
    mockGetBatch.mockResolvedValue({
      contract: 'v1',
      revision: 'r',
      ttlSeconds: 60,
      messages: { 'extracted.admin.title': 'Admin' },
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })
  it('fetches from the backend in development', async () => {
    vi.stubEnv('ENVIRONMENT', 'development')
    mockHeadersGet.mockReturnValue('/login')
    mockGetBatch.mockResolvedValue(localizationBatch('Home'))

    await expect(loadServerMessages('dev')).resolves.toEqual({ nav: { home: 'Home' } })
    expect(mockGetBatch).toHaveBeenCalledTimes(1)
  })
  it('fetches chrome plus the current route from the API', async () => {
    vi.stubEnv('ENVIRONMENT', 'staging')
    const catalog = await loadServerMessages('es')
    expect(catalog).toEqual({ extracted: { admin: { title: 'Admin' } } })
    expect(mockGetBatch).toHaveBeenCalledTimes(1)
    const selectors = mockGetBatch.mock.calls[0]![1] as string
    expect(selectors).toBe(exactSelectorsFor('/admin/ai-costs'))
    await loadServerMessages('es')
    expect(mockGetBatch).toHaveBeenCalledTimes(1)
  })
  it('loads the default selectors when the request has no pathname header', async () => {
    mockHeadersGet.mockReturnValue(null)
    mockGetBatch.mockResolvedValue(localizationBatch('Fallback'))

    await expect(loadServerMessages('missing-path')).resolves.toEqual({ nav: { home: 'Fallback' } })
    expect(mockGetBatch).toHaveBeenCalledExactlyOnceWith('missing-path', exactSelectorsFor('/'))
  })
  it('uses one exact request when the backend returns an empty batch', async () => {
    mockHeadersGet.mockReturnValue('/plans')
    mockGetBatch.mockResolvedValue({
      contract: 'v1',
      revision: 'old',
      ttlSeconds: 60,
      messages: {},
    })

    await expect(loadServerMessages('fr')).resolves.toEqual({})
    expect(mockGetBatch).toHaveBeenCalledExactlyOnceWith('fr', exactSelectorsFor('/plans'))
  })
  it('coalesces concurrent initial loads for the same locale and selectors', async () => {
    vi.stubEnv('ENVIRONMENT', 'production')
    mockHeadersGet.mockReturnValue('/feed')
    mockGetBatch.mockResolvedValue(localizationBatch('Home'))

    const [first, second] = await Promise.all([loadServerMessages('fr'), loadServerMessages('fr')])

    expect(first).toEqual({ nav: { home: 'Home' } })
    expect(second).toEqual(first)
    expect(mockGetBatch).toHaveBeenCalledTimes(1)
  })
  it('serves stale data while one TTL-driven refresh replaces the catalog', async () => {
    vi.stubEnv('ENVIRONMENT', 'production')
    mockHeadersGet.mockReturnValue('/topics')
    const refreshedBatch = localizationBatch('Topics refreshed', 30)
    let resolveRefresh!: (batch: typeof refreshedBatch) => void
    const refresh = new Promise<typeof refreshedBatch>(resolve => {
      resolveRefresh = resolve
    })
    mockGetBatch.mockResolvedValueOnce(localizationBatch('Topics', 10)).mockReturnValueOnce(refresh)

    await expect(loadServerMessages('pt')).resolves.toEqual({ nav: { home: 'Topics' } })
    vi.advanceTimersByTime(9999)
    await expect(loadServerMessages('pt')).resolves.toEqual({ nav: { home: 'Topics' } })
    expect(mockGetBatch).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    const stale = await Promise.all([loadServerMessages('pt'), loadServerMessages('pt')])
    expect(stale).toEqual([{ nav: { home: 'Topics' } }, { nav: { home: 'Topics' } }])
    expect(mockGetBatch).toHaveBeenCalledTimes(2)

    resolveRefresh(refreshedBatch)
    await flushPromises()
    await expect(loadServerMessages('pt')).resolves.toEqual({
      nav: { home: 'Topics refreshed' },
    })
    expect(mockGetBatch).toHaveBeenCalledTimes(2)
  })
  it('evicts failed initial loads so the next request retries', async () => {
    vi.stubEnv('ENVIRONMENT', 'staging')
    mockHeadersGet.mockReturnValue('/my')
    mockGetBatch
      .mockRejectedValueOnce(new Error('localization unavailable'))
      .mockResolvedValueOnce(localizationBatch('Recovered'))
    await expect(loadServerMessages('es')).rejects.toThrow('localization unavailable')
    await expect(loadServerMessages('es')).resolves.toEqual({ nav: { home: 'Recovered' } })
    expect(mockGetBatch).toHaveBeenCalledTimes(2)
    mockGetBatch
      .mockResolvedValueOnce({ ...localizationBatch('Invalid'), messages: null })
      .mockResolvedValueOnce(localizationBatch('Recovered again'))
    await expect(loadServerMessages('pt')).rejects.toThrow(TypeError)
    await expect(loadServerMessages('pt')).resolves.toEqual({ nav: { home: 'Recovered again' } })
    expect(mockGetBatch).toHaveBeenCalledTimes(4)
  })
  it('treats a non-finite API TTL as immediately expired', async () => {
    vi.stubEnv('ENVIRONMENT', 'production')
    mockHeadersGet.mockReturnValue('/settings')
    mockGetBatch
      .mockResolvedValueOnce(localizationBatch('Settings', Number.NaN))
      .mockResolvedValueOnce(localizationBatch('Settings refreshed'))

    await expect(loadServerMessages('invalid-ttl')).resolves.toEqual({
      nav: { home: 'Settings' },
    })
    await expect(loadServerMessages('invalid-ttl')).resolves.toEqual({
      nav: { home: 'Settings' },
    })
    expect(mockGetBatch).toHaveBeenCalledTimes(2)
    await flushPromises()
    await expect(loadServerMessages('invalid-ttl')).resolves.toEqual({
      nav: { home: 'Settings refreshed' },
    })
  })
  it('keeps stale data and backs off a failed refresh for 60 seconds', async () => {
    vi.stubEnv('ENVIRONMENT', 'production')
    mockHeadersGet.mockReturnValue('/communities')
    mockGetBatch
      .mockResolvedValueOnce(localizationBatch('Communities', 1))
      .mockRejectedValueOnce(new Error('refresh unavailable'))
      .mockResolvedValueOnce(localizationBatch('Communities refreshed', 30))

    await expect(loadServerMessages('en')).resolves.toEqual({
      nav: { home: 'Communities' },
    })
    vi.advanceTimersByTime(1000)
    await expect(loadServerMessages('en')).resolves.toEqual({
      nav: { home: 'Communities' },
    })
    await flushPromises()
    expect(mockGetBatch).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(59_999)
    await loadServerMessages('en')
    expect(mockGetBatch).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(1)
    await expect(loadServerMessages('en')).resolves.toEqual({
      nav: { home: 'Communities' },
    })
    expect(mockGetBatch).toHaveBeenCalledTimes(3)
    await flushPromises()
    await expect(loadServerMessages('en')).resolves.toEqual({
      nav: { home: 'Communities refreshed' },
    })
  })
  it('reports the catalog snapshot revision for the current pathname selectors', async () => {
    mockHeadersGet.mockReturnValue('/articles')
    mockGetBatch.mockResolvedValue(localizationBatch('Articles', 60))
    vi.stubEnv('NODE_ENV', 'development')
    const catalog = await loadServerMessages('it')
    expect(catalog).toEqual({ nav: { home: 'Articles' } })
    expect(ssrLocalizationRevisionHtmlProps(catalog)).toEqual({
      [SSR_LOCALIZATION_REVISION_ATTRIBUTE]: 'revision-Articles',
    })
  })
  it('keys catalog snapshots by pathname selectors, not locale alone', async () => {
    mockHeadersGet.mockReturnValue('/appeals')
    mockGetBatch.mockResolvedValueOnce(localizationBatch('Appeals', 60))
    const appeals = await loadServerMessages('en')
    expect(appeals).toEqual({ nav: { home: 'Appeals' } })
    mockHeadersGet.mockReturnValue('/admin/queues')
    mockGetBatch.mockResolvedValueOnce(localizationBatch('Queues', 60))
    const queues = await loadServerMessages('en')
    expect(queues).toEqual({ nav: { home: 'Queues' } })
    vi.stubEnv('NODE_ENV', 'development')
    expect(ssrLocalizationRevisionHtmlProps(appeals)).toEqual({
      [SSR_LOCALIZATION_REVISION_ATTRIBUTE]: 'revision-Appeals',
    })
    expect(ssrLocalizationRevisionHtmlProps(queues)).toEqual({
      [SSR_LOCALIZATION_REVISION_ATTRIBUTE]: 'revision-Queues',
    })
    mockHeadersGet.mockReturnValue('/appeals')
    const cached = await loadServerMessages('en')
    expect(ssrLocalizationRevisionHtmlProps(cached)).toEqual({
      [SSR_LOCALIZATION_REVISION_ATTRIBUTE]: 'revision-Appeals',
    })
  })
  it('keeps the stale catalog revision while TTL is still valid after the backend changes', async () => {
    mockHeadersGet.mockReturnValue('/blog')
    mockGetBatch
      .mockResolvedValueOnce(localizationBatch('Blog', 60))
      .mockResolvedValueOnce(localizationBatch('Blog next', 60))
    vi.stubEnv('NODE_ENV', 'development')
    const first = await loadServerMessages('nl')
    expect(first).toEqual({ nav: { home: 'Blog' } })
    expect(ssrLocalizationRevisionHtmlProps(first)).toEqual({
      [SSR_LOCALIZATION_REVISION_ATTRIBUTE]: 'revision-Blog',
    })
    vi.advanceTimersByTime(59_000)
    const cached = await loadServerMessages('nl')
    expect(cached).toEqual({ nav: { home: 'Blog' } })
    expect(ssrLocalizationRevisionHtmlProps(cached)).toEqual({
      [SSR_LOCALIZATION_REVISION_ATTRIBUTE]: 'revision-Blog',
    })
    expect(mockGetBatch).toHaveBeenCalledTimes(1)
  })
  it('updates the snapshot revision after a TTL refresh completes', async () => {
    mockHeadersGet.mockReturnValue('/channels')
    const refreshedBatch = localizationBatch('Channels next', 30)
    let resolveRefresh!: (batch: typeof refreshedBatch) => void
    const refresh = new Promise<typeof refreshedBatch>(resolve => {
      resolveRefresh = resolve
    })
    mockGetBatch
      .mockResolvedValueOnce(localizationBatch('Channels', 10))
      .mockReturnValueOnce(refresh)

    const stale = await loadServerMessages('sv')
    expect(stale).toEqual({ nav: { home: 'Channels' } })
    vi.advanceTimersByTime(10_000)
    await expect(loadServerMessages('sv')).resolves.toEqual({ nav: { home: 'Channels' } })
    vi.stubEnv('NODE_ENV', 'development')
    expect(ssrLocalizationRevisionHtmlProps(stale)).toEqual({
      [SSR_LOCALIZATION_REVISION_ATTRIBUTE]: 'revision-Channels',
    })
    resolveRefresh(refreshedBatch)
    await flushPromises()
    expect(ssrLocalizationRevisionHtmlProps(stale)).toEqual({
      [SSR_LOCALIZATION_REVISION_ATTRIBUTE]: 'revision-Channels',
    })
    const next = await loadServerMessages('sv')
    expect(next).toEqual({ nav: { home: 'Channels next' } })
    expect(ssrLocalizationRevisionHtmlProps(next)).toEqual({
      [SSR_LOCALIZATION_REVISION_ATTRIBUTE]: 'revision-Channels next',
    })
  })
  it('emits development html props from the catalog snapshot revision', async () => {
    mockHeadersGet.mockReturnValue('/messages')
    mockGetBatch.mockResolvedValue(localizationBatch('Messages', 60))
    const catalog = await loadServerMessages('en')
    vi.stubEnv('NODE_ENV', 'development')
    expect(ssrLocalizationRevisionHtmlProps(catalog)).toEqual({
      [SSR_LOCALIZATION_REVISION_ATTRIBUTE]: 'revision-Messages',
    })
  })
  it('omits html props outside development', async () => {
    mockHeadersGet.mockReturnValue('/cards')
    mockGetBatch.mockResolvedValue(localizationBatch('Cards', 60))
    const catalog = await loadServerMessages('en')
    vi.stubEnv('NODE_ENV', 'production')
    expect(ssrLocalizationRevisionHtmlProps(catalog)).toEqual({})
  })
})
