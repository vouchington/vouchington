import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadClientMessages } from '../load-client-messages'
import { ROUTE_SELECTORS, WEB_CHROME_SELECTOR } from '../route-selectors.generated.mts'

function exactSelectorsFor(pattern: string): string[] {
  const route = ROUTE_SELECTORS.find(entry => entry.pattern === pattern)
  if (!route) throw new Error(`Missing generated route ${pattern}`)
  return [WEB_CHROME_SELECTOR, route.selectorId].toSorted()
}

const { mockGetBatch } = vi.hoisted(() => ({
  mockGetBatch: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/localization'), () => ({
  getWebLocalizationBatchClient: mockGetBatch,
}))

describe('loadClientMessages', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    mockGetBatch.mockReset()
  })

  it('fetches the current route batch in a development browser', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    mockGetBatch.mockResolvedValue({
      contract: 'v1',
      revision: 'r',
      ttlSeconds: 60,
      messages: { 'nav.home': 'Home' },
    })
    const catalog = await loadClientMessages('en')
    expect(catalog).toEqual({ nav: { home: 'Home' } })
    expect(mockGetBatch).toHaveBeenCalledWith('en', exactSelectorsFor('/'))
  })

  it('requires the backend SSR catalog during production SSR', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubGlobal('window', undefined)
    await expect(loadClientMessages('en')).rejects.toThrow('backend SSR catalog')
    expect(mockGetBatch).not.toHaveBeenCalled()
  })

  it('fetches the current route batch in a production browser', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    mockGetBatch.mockResolvedValue({
      contract: 'v1',
      revision: 'r',
      ttlSeconds: 60,
      messages: { 'nav.home': 'Inicio' },
    })
    const catalog = await loadClientMessages('es')
    expect(catalog).toEqual({ nav: { home: 'Inicio' } })
    expect(mockGetBatch).toHaveBeenCalledWith('es', exactSelectorsFor('/'))
  })

  it('fetches the explicit destination route instead of the persisted layout pathname', async () => {
    mockGetBatch.mockResolvedValue({
      contract: 'v1',
      revision: 'r',
      ttlSeconds: 60,
      messages: { 'extracted.my.notifications.title': 'Notifications' },
    })

    await loadClientMessages('en', '/my/notifications')

    expect(mockGetBatch).toHaveBeenCalledWith('en', exactSelectorsFor('/my/notifications'))
  })

  it('uses one exact request when the backend returns an empty batch', async () => {
    mockGetBatch.mockResolvedValue({ contract: 'v1', revision: 'r', ttlSeconds: 60, messages: {} })

    await expect(loadClientMessages('en', '/plans')).resolves.toEqual({})
    expect(mockGetBatch).toHaveBeenCalledExactlyOnceWith('en', exactSelectorsFor('/plans'))
  })
})
