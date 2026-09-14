import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getWebLocalizationBatchClient } from '../localization'
import { WEB_LOCALIZATION_PATH, webLocalizationSearchParams } from '@/lib/i18n/localization-query'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: mockGet,
      },
    }) as unknown as typeof import('../instance'),
)

describe('getWebLocalizationBatchClient', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({ contract: 'v1', revision: 'r', ttlSeconds: 60, messages: {} })
  })

  it('fetches the public localization batch for the given selectors', async () => {
    const selectors = ['nav.*', 'common.*']
    const batch = {
      contract: 'v1',
      revision: 'abc',
      ttlSeconds: 60,
      messages: { 'nav.home': 'Home' },
    }
    mockGet.mockResolvedValueOnce(batch)

    await expect(getWebLocalizationBatchClient('es', selectors)).resolves.toBe(batch)
    expect(mockGet).toHaveBeenCalledWith(WEB_LOCALIZATION_PATH, {
      searchParams: webLocalizationSearchParams('es', selectors),
    })
  })
})
