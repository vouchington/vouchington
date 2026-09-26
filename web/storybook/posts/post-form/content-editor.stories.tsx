import { useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { countSentences, countWords } from '@ts-shared/utils/text-metrics'
import { ContentEditor } from '@/components/posts/post-form/content-editor'
import { StoryFrame } from '@/storybook/story-frame'
import { reviewMarkdown } from '../fixtures'

const meta = {
  title: 'Posts/Content Editor',
  component: ContentEditor,
} satisfies Meta

export default meta
type Story = StoryObj

function previewParagraph(markdown: string): string {
  const text = markdown.trim()
  return text ? `<p>${text}</p>` : ''
}

function ContentEditorStory({
  initialMarkdown,
  initialTab,
}: {
  initialMarkdown: string
  initialTab: 'write' | 'preview'
}) {
  const [markdown, setMarkdown] = useState(initialMarkdown)
  const [activeTab, setActiveTab] = useState(initialTab)
  const [previewHtml, setPreviewHtml] = useState(
    initialTab === 'preview' ? previewParagraph(initialMarkdown) : '',
  )
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const selectTab = (tab: 'write' | 'preview') => {
    setActiveTab(tab)
    if (tab === 'preview') setPreviewHtml(previewParagraph(markdown))
  }
  return (
    <StoryFrame width='max-w-xl'>
      <ContentEditor
        activeTab={activeTab}
        contentLocked={false}
        markdown={markdown}
        postType='review'
        previewHtml={previewHtml}
        previewLoading={false}
        reviewCharCount={markdown.length}
        reviewSentenceCount={countSentences(markdown)}
        reviewWordCount={countWords(markdown)}
        setActiveTab={selectTab}
        setMarkdown={setMarkdown}
        textareaRef={textareaRef}
      />
    </StoryFrame>
  )
}

export const Write: Story = {
  render: () => (
    <ContentEditorStory
      initialMarkdown={reviewMarkdown}
      initialTab='write'
    />
  ),
}

export const Preview: Story = {
  render: () => (
    <ContentEditorStory
      initialMarkdown={reviewMarkdown}
      initialTab='preview'
    />
  ),
}
