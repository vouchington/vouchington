import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMyTopicClaims, getPendingTopicClaims, getTopicClaims } from './topic-claims'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'
import type { PageInfo } from '@voucha/types/pagination'

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
  const emptyPage = {
    results: [],
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null } satisfies PageInfo,
  }
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue(emptyPage)
  })

  it('calls /api/v1/my/topic-claims', async () => {
    await expectApiWrapperCall({
      mock: mockGet,
      response: emptyPage,
      call: () => getMyTopicClaims() as Promise<typeof emptyPage>,
      expectedArgs: ['/api/v1/my/topic-claims'],
    })
  })

  it('passes bounded topic and verified filters to the claim page', async () => {
    await expectApiWrapperCall({
      mock: mockGet,
      response: emptyPage,
      call: () =>
        getMyTopicClaims('topic-1,topic-2', true, 'cursor', 2) as Promise<typeof emptyPage>,
      expectedArgs: [
        '/api/v1/my/topic-claims?topic_ids=topic-1%2Ctopic-2&verified_only=true&after=cursor&limit=2',
      ],
    })
  })

  it('calls /api/v1/admin/topic-claims', async () => {
    await getPendingTopicClaims()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/admin/topic-claims')
  })

  it('calls /api/v1/topics/:id/claims', async () => {
    await expectApiWrapperCall({
      mock: mockGet,
      response: emptyPage,
      call: () => getTopicClaims('my-topic'),
      expectedArgs: ['/api/v1/topics/my-topic/claims'],
    })
  })

  it('requests active caller-only claims by topic', async () => {
    await expectApiWrapperCall({
      mock: mockGet,
      response: emptyPage,
      call: () => getTopicClaims('my-topic', true, true),
      expectedArgs: ['/api/v1/topics/my-topic/claims?active_only=true&mine_only=true'],
    })
  })

  it('passes a bounded limit for a topic claim page', async () => {
    await expectApiWrapperCall({
      mock: mockGet,
      response: emptyPage,
      call: () => getTopicClaims('my-topic', true, true, 1),
      expectedArgs: ['/api/v1/topics/my-topic/claims?active_only=true&mine_only=true&limit=1'],
    })
  })
})
