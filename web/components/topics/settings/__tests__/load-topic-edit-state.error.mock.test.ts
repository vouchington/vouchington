import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchSpendingCategoryAttributes,
  fetchTopic,
  getTopicTypeAttributes,
} from '@/lib/api/client/topics'
import { loadTopicEditState } from '../load-topic-edit-state'

vi.mock(import('@/lib/api/client/topics'), () => ({
  fetchSpendingCategoryAttributes: vi.fn<VitestLooseMock>(),
  fetchTopic: vi.fn<VitestLooseMock>(),
  getTopicTypeAttributes: vi.fn<VitestLooseMock>(),
}))

const mockFetchTopic = vi.mocked(fetchTopic)
const mockFetchSpending = vi.mocked(fetchSpendingCategoryAttributes)
const mockGetTypeAttrs = vi.mocked(getTopicTypeAttributes)

describe('loadTopicEditState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns loadError when fetchTopic throws', async () => {
    mockFetchTopic.mockRejectedValueOnce(new Error('Boom'))
    mockFetchSpending.mockResolvedValueOnce(null as never)

    const result = await loadTopicEditState('topic-1')
    expect(result.loadError).toBe('Boom')
    expect(result.loading).toBe(false)
  })

  it('returns loadError with default message for non-Error rejections', async () => {
    mockFetchTopic.mockRejectedValueOnce('weird')
    mockFetchSpending.mockResolvedValueOnce(null as never)

    const result = await loadTopicEditState('topic-1')
    expect(result.loadError).toBe('Failed to load topic')
  })

  it('returns topic: null when fetchTopic resolves to null', async () => {
    mockFetchTopic.mockResolvedValueOnce(null as never)
    mockFetchSpending.mockResolvedValueOnce(null as never)

    const result = await loadTopicEditState('topic-1')
    expect(result.topic).toBeNull()
    expect(result.loading).toBe(false)
  })

  it('returns typeAttributes: null when topic has no topic_type', async () => {
    mockFetchTopic.mockResolvedValueOnce({ id: 'topic-1', topic_type: null } as never)
    mockFetchSpending.mockResolvedValueOnce(null as never)

    const result = await loadTopicEditState('topic-1')
    expect(result.typeAttributes).toBeNull()
    expect(result.topic).toEqual({ id: 'topic-1', topic_type: null })
  })

  it('returns typeAttributes: null when getTopicTypeAttributes throws', async () => {
    mockFetchTopic.mockResolvedValueOnce({ id: 'topic-1', topic_type: 'card' } as never)
    mockFetchSpending.mockResolvedValueOnce(null as never)
    mockGetTypeAttrs.mockRejectedValueOnce(new Error('Attrs failed'))

    const result = await loadTopicEditState('topic-1')
    expect(result.typeAttributes).toBeNull()
  })

  it('returns typeAttributes when getTopicTypeAttributes resolves for typed topic', async () => {
    mockFetchTopic.mockResolvedValueOnce({ id: 'topic-1', topic_type: 'card' } as never)
    mockFetchSpending.mockResolvedValueOnce(null as never)
    mockGetTypeAttrs.mockResolvedValueOnce({ annual_fee: 95 } as never)

    const result = await loadTopicEditState('topic-1')
    expect(result.typeAttributes).toEqual({ annual_fee: 95 })
  })

  it('resolves saved type-attribute ids to topic names and skips unresolved ones', async () => {
    mockFetchTopic.mockImplementation(async (tid: string) => {
      if (tid === 'topic-1') return { id: 'topic-1', topic_type: 'card' } as never
      if (tid === 'bank-1') return { id: 'bank-1', name: 'Chase' } as never
      return null as never
    })
    mockFetchSpending.mockResolvedValueOnce(null as never)
    mockGetTypeAttrs.mockResolvedValueOnce({ bank_id: 'bank-1', brand_id: 'missing' } as never)

    const result = await loadTopicEditState('topic-1')
    expect(result.typeAttributeNames).toEqual({ bank_id: 'Chase' })
  })

  it('skips type-attribute ids whose topic lookup rejects', async () => {
    mockFetchTopic.mockImplementation(async (tid: string) => {
      if (tid === 'topic-1') return { id: 'topic-1', topic_type: 'card' } as never
      throw new Error('lookup failed')
    })
    mockFetchSpending.mockResolvedValueOnce(null as never)
    mockGetTypeAttrs.mockResolvedValueOnce({ bank_id: 'bank-1' } as never)

    const result = await loadTopicEditState('topic-1')
    expect(result.typeAttributeNames).toEqual({})
  })

  it('treats fetchSpendingCategoryAttributes rejection as null', async () => {
    mockFetchTopic.mockResolvedValueOnce({ id: 'topic-1', topic_type: 'topic' } as never)
    mockFetchSpending.mockRejectedValueOnce(new Error('Spending failed'))

    const result = await loadTopicEditState('topic-1')
    expect(result.isForeignTransaction).toBe(false)
    expect(result.spendingFrequency).toBe('')
  })

  it('uses spending data when present', async () => {
    mockFetchTopic.mockResolvedValueOnce({ id: 'topic-1', topic_type: 'topic' } as never)
    mockFetchSpending.mockResolvedValueOnce({
      is_foreign_transaction: true,
      default_spending_frequency: 'monthly',
    } as never)

    const result = await loadTopicEditState('topic-1')
    expect(result.isForeignTransaction).toBe(true)
    expect(result.spendingFrequency).toBe('monthly')
  })
})
