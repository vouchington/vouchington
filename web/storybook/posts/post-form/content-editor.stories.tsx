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

function ContentEditorStory({
  initialMarkdown,
  initialTab,
  previewHtml,
}: {
  initialMarkdown: string
  initialTab: 'write' | 'preview'
  previewHtml: string
}) {
  const [markdown, setMarkdown] = useState(initialMarkdown)
  const [activeTab, setActiveTab] = useState(initialTab)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
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
        setActiveTab={setActiveTab}
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
      previewHtml=''
    />
  ),
}

export const Preview: Story = {
  render: () => (
    <ContentEditorStory
      initialMarkdown={reviewMarkdown}
      initialTab='preview'
      previewHtml={`<p>${reviewMarkdown}</p>`}
    />
  ),
}
