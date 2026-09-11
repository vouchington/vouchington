import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getReviewDisputes, getPostDisputeAnnotation } from './disputes'

const { mockGet, mockReturnNullForMissingEntity } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
  mockReturnNullForMissingEntity: vi.fn<VitestLooseMock>(
    async (promise: Promise<unknown>) => promise,
  ),
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

vi.mock(import('../return-null-for-missing-entity'), () => ({
  returnNullForMissingEntity: mockReturnNullForMissingEntity,
}))

describe('disputes server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockReturnNullForMissingEntity.mockClear()
    mockGet.mockResolvedValue({
      disputes: [],
      page_info: { has_next_page: false, end_cursor: null },
    })
  })

  it('calls /api/v1/disputes with default options', async () => {
    await getReviewDisputes()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/disputes', {})
  })

  it('calls /api/v1/disputes with search params', async () => {
    const options = { searchParams: { limit: 50, cursor: 'abc' } }
    await getReviewDisputes(options)
    expect(mockGet).toHaveBeenCalledWith('/api/v1/disputes', options)
  })

  describe('getPostDisputeAnnotation', () => {
    it('returns annotation when present', async () => {
      const annotation = {
        id: 'ann-1',
        post_id: 'post-1',
        review_dispute_id: 'dispute-1',
        body_text: 'This review contains errors.',
        created_at: '2026-01-01T00:00:00Z',
      }
      mockGet.mockResolvedValueOnce({ annotation })
      const result = await getPostDisputeAnnotation('post-1')
      expect(result).toEqual(annotation)
      expect(mockGet).toHaveBeenCalledWith('/api/v1/posts/post-1/dispute-annotation')
      expect(mockReturnNullForMissingEntity).toHaveBeenCalledTimes(1)
    })

    it('returns null when annotation is null', async () => {
      mockGet.mockResolvedValueOnce({ annotation: null })
      const result = await getPostDisputeAnnotation('post-1')
      expect(result).toBeNull()
    })

    it('returns null when the entity is missing via returnNullForMissingEntity', async () => {
      mockReturnNullForMissingEntity.mockResolvedValueOnce(null)
      const result = await getPostDisputeAnnotation('post-1')
      expect(result).toBeNull()
    })
  })
})
