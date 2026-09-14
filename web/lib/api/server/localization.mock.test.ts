import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getWebLocalizationBatch } from './localization'
import { WEB_LOCALIZATION_PATH, webLocalizationSearchParams } from '@/lib/i18n/localization-query'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () =>
    ({
      serverApi: {
        get: mockGet,
      },
    }) as unknown as typeof import('./instance'),
)

vi.mock<typeof import('react')>(import('react'), async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    cache: ((fn: (...args: never[]) => unknown) => fn) as unknown as typeof actual.cache,
  }
})

describe('getWebLocalizationBatch', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({ contract: 'v1', revision: 'r', ttlSeconds: 60, messages: {} })
  })

  it('splits the selector csv into the public query', async () => {
    const selectors = 'nav.*,common.*'
    const batch = {
      contract: 'v1',
      revision: 'abc',
      ttlSeconds: 60,
      messages: { 'nav.home': 'Home' },
    }
    mockGet.mockResolvedValueOnce(batch)

    await expect(getWebLocalizationBatch('fr', selectors)).resolves.toBe(batch)
    expect(mockGet).toHaveBeenCalledWith(WEB_LOCALIZATION_PATH, {
      searchParams: webLocalizationSearchParams('fr', selectors.split(',')),
    })
  })
})
