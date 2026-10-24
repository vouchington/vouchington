import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostContentText } from '@/components/posts/post-content-text'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Posts/Post Content Text',
  component: PostContentText,
} satisfies Meta

export default meta
type Story = StoryObj

export const MixedDirections: Story = {
  render: () => (
    <StoryFrame width='max-w-lg'>
      <div className='space-y-3'>
        <PostContentText
          as='p'
          content={{ text: 'A card review in English', declared_language: 'en' }}
        />
        <PostContentText
          as='p'
          content={{ text: 'مراجعة البطاقة', declared_language: 'ar' }}
        />
      </div>
    </StoryFrame>
  ),
}

export const MissingContent: Story = {
  render: () => (
    <StoryFrame width='max-w-lg'>
      <PostContentText
        as='p'
        content={null}
        fallback='This post has no title'
      />
    </StoryFrame>
  ),
}
