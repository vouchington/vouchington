import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateConversationTitle } from './conversations'

const { mockPost } = vi.hoisted(() => ({
  mockPost: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () =>
    ({
      clientApi: {
        post: mockPost,
      },
    }) as unknown as typeof import('./instance'),
)

describe('generateConversationTitle', () => {
  beforeEach(() => {
    mockPost.mockReset()
    mockPost.mockResolvedValue({ conversation: { id: 'conv-1', title: 'Generated Title' } })
  })

  it('calls POST /api/v1/my/conversations/:id/title with no body', async () => {
    await generateConversationTitle('conv-1')
    expect(mockPost).toHaveBeenCalledWith('/api/v1/my/conversations/conv-1/title')
  })
})
