import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { updatePost } from '@/lib/api/client/posts'
import { CommentNodeEditForm } from '../comment-node-edit-form'
import type { Post } from '@/types/posts'

vi.mock(import('@/lib/api/client/posts'), () => ({
  updatePost: vi.fn<VitestLooseMock>(),
}))

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
  default: (_err: unknown, options: { fallback: string }) => {
    toastMock.error(options.fallback)
    return options.fallback
  },
  onSuccess: (message: string) => {
    toastMock.success(message)
  },
}))

const mockedUpdatePost = vi.mocked(updatePost)

const basePost: Post = {
  id: 'comment-1',
  post_type: 'comment',
  title: '',
  markdown: 'Original comment text',
  root_id: 'root-1',
  parent_id: 'root-1',
  created_by_id: 'user-1',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  deleted_by_id: null,
  archived_at: null,
  archived_by_id: null,
  broadcast: 'everyone',
  privacy: 'public',
  is_anonymous: false,
  community_id: null,
  clearance_status: 'approved',
}

describe('CommentNodeEditForm', () => {
  it('renders a textarea pre-filled with post.markdown', () => {
    render(
      <CommentNodeEditForm
        post={basePost}
        onSave={vi.fn<VitestLooseMock>()}
        onCancel={vi.fn<VitestLooseMock>()}
      />,
    )
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toBe('Original comment text')
  })

  it('Save button is disabled when markdown is empty', () => {
    const emptyPost: Post = { ...basePost, markdown: '' }
    render(
      <CommentNodeEditForm
        post={emptyPost}
        onSave={vi.fn<VitestLooseMock>()}
        onCancel={vi.fn<VitestLooseMock>()}
      />,
    )
    const saveButton = screen.getByRole('button', { name: 'Save' })
    expect((saveButton as HTMLButtonElement).disabled).toBe(true)
  })

  it('Save button is disabled when markdown is only whitespace', () => {
    const whitespacePost: Post = { ...basePost, markdown: '   ' }
    render(
      <CommentNodeEditForm
        post={whitespacePost}
        onSave={vi.fn<VitestLooseMock>()}
        onCancel={vi.fn<VitestLooseMock>()}
      />,
    )
    const saveButton = screen.getByRole('button', { name: 'Save' })
    expect((saveButton as HTMLButtonElement).disabled).toBe(true)
  })

  it('Save button is enabled when markdown has content', () => {
    render(
      <CommentNodeEditForm
        post={basePost}
        onSave={vi.fn<VitestLooseMock>()}
        onCancel={vi.fn<VitestLooseMock>()}
      />,
    )
    const saveButton = screen.getByRole('button', { name: 'Save' })
    expect((saveButton as HTMLButtonElement).disabled).toBe(false)
  })

  it('Cancel button calls onCancel when clicked', () => {
    const onCancel = vi.fn<VitestLooseMock>()
    render(
      <CommentNodeEditForm
        post={basePost}
        onSave={vi.fn<VitestLooseMock>()}
        onCancel={onCancel}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('renders with data-pw attribute on the form', () => {
    const { container } = render(
      <CommentNodeEditForm
        post={basePost}
        onSave={vi.fn<VitestLooseMock>()}
        onCancel={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(container.querySelector('[data-pw="comment-edit-form"]')).toBeDefined()
  })

  it('shows success toast and calls onSave when submission succeeds', async () => {
    const updatedPost = { ...basePost, markdown: 'Original comment text' }
    mockedUpdatePost.mockResolvedValueOnce({ post: updatedPost })
    const onSave = vi.fn<VitestLooseMock>()

    render(
      <CommentNodeEditForm
        post={basePost}
        onSave={onSave}
        onCancel={vi.fn<VitestLooseMock>()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith('Comment updated')
      expect(onSave).toHaveBeenCalledWith(updatedPost)
    })
  })

  it('reports submit failures via onError fallback', async () => {
    mockedUpdatePost.mockRejectedValueOnce(new Error('Update failed'))

    render(
      <CommentNodeEditForm
        post={basePost}
        onSave={vi.fn<VitestLooseMock>()}
        onCancel={vi.fn<VitestLooseMock>()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to save comment')
    })
  })
})
