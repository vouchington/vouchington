import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listMyBans } from './bans'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () =>
    ({
      clientApi: {
        get: mockGet,
      },
    }) as unknown as typeof import('./instance'),
)

describe('bans client api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({
      bans: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })
  })

  describe('listMyBans', () => {
    it('calls GET /api/v1/my/bans with no params when no continuation is given', async () => {
      await listMyBans()
      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/bans')
    })

    it('appends encoded after as query param when continuation is provided', async () => {
      await listMyBans('cursor-abc')
      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/bans?after=cursor-abc')
    })

    it('URL-encodes special characters in cursor', async () => {
      await listMyBans('a+b/c=d')
      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/bans?after=a%2Bb%2Fc%3Dd')
    })
  })
})
