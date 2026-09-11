import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMyTopicClaims, getPendingTopicClaims, getTopicClaims } from './topic-claims'

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

describe('topic-claims server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({ claims: [] })
  })

  it('calls /api/v1/my/topic-claims', async () => {
    await getMyTopicClaims()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/my/topic-claims')
  })

  it('calls /api/v1/admin/topic-claims', async () => {
    await getPendingTopicClaims()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/admin/topic-claims')
  })

  it('calls /api/v1/topics/:id/claims', async () => {
    await getTopicClaims('my-topic')
    expect(mockGet).toHaveBeenCalledWith('/api/v1/topics/my-topic/claims')
  })
})
