import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostLanguageField } from '@/components/posts/post-form/advanced-options-fields'

const meta = {
  title: 'Shared/PostLanguageField',
  component: PostLanguageField,
} satisfies Meta<typeof PostLanguageField>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto max-w-sm space-y-4 rounded-md border p-4'>{children}</div>
  </main>
)

function PostLanguageFieldStory() {
  const [language, setLanguage] = useState<string | null>(null)
  return (
    <Frame>
      <PostLanguageField
        language={language}
        setLanguage={setLanguage}
      />
    </Frame>
  )
}

export const Default: Story = {
  args: {
    language: null,
    setLanguage: () => {},
  },
  render: () => <PostLanguageFieldStory />,
}
