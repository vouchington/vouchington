import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock(import('@/lib/api/client/posts'), () => ({
  createPost: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/markdown'), () => ({
  previewMarkdown: vi.fn<VitestLooseMock>().mockResolvedValue({ html: '' }),
}))

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({
        currentUser: { id: 'u1' },
        isAuthenticated: true,
        logout: vi.fn<() => Promise<void>>(),
        setUser: vi.fn<(user: { id: string } | null) => void>(),
      }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(
  import('@/components/shared/markdown-content'),
  () =>
    ({
      MARKDOWN_CONTENT_FEATURES_RICH: { code: true, images: true, utm: true },
      MarkdownContent: ({ html }: { html: string }) => <div data-testid='markdown'>{html}</div>,
    }) as unknown as typeof import('@/components/shared/markdown-content'),
)

const { toastMock } = vi.hoisted(() => {
  const mock = Object.assign(vi.fn<VitestLooseMock>(), {
    error: vi.fn<VitestLooseMock>(),
    success: vi.fn<VitestLooseMock>(),
  })
  return { toastMock: mock }
})

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: toastMock,
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/on-error'), () => ({
  default: (err: unknown, options: { fallback: string }) => {
    toastMock.error(options.fallback)
    return options.fallback
  },
  onSuccess: (message: string) => {
    toastMock.success(message)
  },
}))

import { CommentReplyForm } from '../comment-reply-form'
import { createPost } from '@/lib/api/client/posts'

const mockCreatePost = vi.mocked(createPost)

const baseProps = {
  parentId: 'parent-1',
  rootId: 'root-1',
  onSuccess: vi.fn<VitestLooseMock>(),
}

describe('CommentReplyForm — error path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports submit failures via onError fallback', async () => {
    mockCreatePost.mockRejectedValueOnce(new Error('Network down'))

    render(<CommentReplyForm {...baseProps} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'reply body' } })

    fireEvent.click(screen.getByRole('button', { name: 'Reply' }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to post comment')
    })
  })
})
