import { describe, it, vi, beforeEach, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { expectTextareaCmdEnterSubmits } from '@/test-helpers/form-keyboard'

let mockIsAuthenticated = true
let mockPathname = '/topic/voucha/comments'

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
        currentUser: mockIsAuthenticated ? { id: 'u1' } : null,
        isAuthenticated: mockIsAuthenticated,
        logout: vi.fn<() => Promise<void>>(),
        setUser: vi.fn<(user: { id: string } | null) => void>(),
      }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(import('next/navigation'), () => ({
  usePathname: () => mockPathname,
}))

vi.mock(
  import('@/components/shared/markdown-content'),
  () =>
    ({
      MARKDOWN_CONTENT_FEATURES_RICH: { code: true, images: true, utm: true },
      MarkdownContent: ({ html }: { html: string }) => <div data-testid='markdown'>{html}</div>,
    }) as unknown as typeof import('@/components/shared/markdown-content'),
)

import { CommentReplyForm } from '../comment-reply-form'
import { createPost } from '@/lib/api/client/posts'

const mockCreatePost = vi.mocked(createPost)

const baseProps = {
  parentId: 'parent-1',
  rootId: 'root-1',
  onSuccess: vi.fn<VitestLooseMock>(),
}

describe('CommentReplyForm — keyboard submit convention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAuthenticated = true
    mockPathname = '/topic/voucha/comments'
    mockCreatePost.mockResolvedValue({
      post: { id: 'comment-new' },
    } as Awaited<ReturnType<typeof createPost>>)
  })

  it('submits on Meta+Enter, Ctrl+Enter, but not plain Enter in the textarea', () => {
    render(<CommentReplyForm {...baseProps} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    // Use a native submit listener so the re-entry guard between keydowns doesn't
    // prevent the second assertion. setup refills the textarea after each submit clears it.
    const onSubmit = vi.fn<VitestLooseMock>()
    textarea.form!.addEventListener('submit', onSubmit)
    expectTextareaCmdEnterSubmits({
      textarea,
      onSubmit,
      setup: () => fireEvent.change(textarea, { target: { value: 'reply body' } }),
    })
  })

  it('lazily mounts the Turnstile widget only once the user starts composing', () => {
    const { container } = render(<CommentReplyForm {...baseProps} />)
    expect(container.querySelector('[data-pw="comment-reply-textarea"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="turnstile-container"]')).toBeNull()

    fireEvent.focus(screen.getByRole('textbox'))
    expect(container.querySelector('[data-pw="turnstile-container"]')).not.toBeNull()
  })

  it('uses a return URL for the signed-out comment CTA', () => {
    mockIsAuthenticated = false
    mockPathname = '/topic/voucha/comments'

    render(<CommentReplyForm {...baseProps} />)

    const signInLink = screen.getByRole('link', { name: 'Sign in' })
    expect(signInLink).toHaveAttribute(
      'href',
      '/login?next=%2Ftopic%2Fvoucha%2Fcomments&intent=comment',
    )
  })
})
