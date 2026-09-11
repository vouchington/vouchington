import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CommentReplyPreview } from '../comment-reply-preview'

vi.mock(
  import('@/components/shared/markdown-content'),
  () =>
    ({
      MarkdownContent: ({ html }: { html: string }) => <div data-testid='markdown'>{html}</div>,
    }) as unknown as typeof import('@/components/shared/markdown-content'),
)

describe('CommentReplyPreview', () => {
  it('renders loading, empty, and markdown preview states', () => {
    const { rerender } = render(
      <CommentReplyPreview
        previewHtml=''
        previewLoading
      />,
    )
    expect(screen.getByText('Loading preview…')).toBeInTheDocument()

    rerender(
      <CommentReplyPreview
        previewHtml=''
        previewLoading={false}
      />,
    )
    expect(screen.getByText('Nothing to preview yet.')).toBeInTheDocument()

    rerender(
      <CommentReplyPreview
        previewHtml='<p>Hello</p>'
        previewLoading={false}
      />,
    )
    expect(screen.getByTestId('markdown')).toHaveTextContent('<p>Hello</p>')
  })
})
