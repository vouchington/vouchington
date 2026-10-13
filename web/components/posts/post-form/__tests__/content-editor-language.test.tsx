import '@/test-helpers/components/shared/markdown-highlighter.mock-support'
import { createRef } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ContentEditor } from '../content-editor'

const editorProps = {
  activeTab: 'preview' as const,
  contentLocked: false,
  markdown: 'text',
  postType: 'discussion' as const,
  previewLoading: false,
  reviewCharCount: 0,
  reviewSentenceCount: 0,
  reviewWordCount: 0,
  setActiveTab: () => undefined,
  setMarkdown: () => undefined,
  textareaRef: createRef<HTMLTextAreaElement>(),
}

describe('ContentEditor preview language', () => {
  it('marks the preview with the declared content language', () => {
    const { container } = render(
      <ContentEditor
        {...editorProps}
        language='ar'
        previewHtml='<p>مرحبا</p>'
      />,
    )

    const preview = container.querySelector('[lang]')
    expect(preview).toHaveAttribute('lang', 'ar')
    expect(preview).toHaveAttribute('dir', 'rtl')
    expect(preview).toHaveTextContent('مرحبا')
  })

  it('uses dir auto when the draft has no declared language', () => {
    const { container } = render(
      <ContentEditor
        {...editorProps}
        language={null}
        previewHtml='<p>Hello</p>'
      />,
    )

    const preview = container.querySelector('.prose')
    expect(preview).not.toBeNull()
    expect(preview).not.toHaveAttribute('lang')
    expect(preview).toHaveAttribute('dir', 'auto')
  })
})
