import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { StoryFrame } from '@/storybook/story-frame'
import { posts } from '@/storybook/entities/fixtures/posts'

const meta = {
  title: 'Shared/Infinite Scroll',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function PostList() {
  return (
    <ul className='space-y-2'>
      {posts.slice(0, 3).map(post => (
        <li
          key={post.id}
          className='rounded-md border p-3 text-sm'
        >
          {post.title}
        </li>
      ))}
    </ul>
  )
}

export const EndOfResults: Story = {
  render: () => (
    <StoryFrame>
      <InfiniteScroll
        hasNextPage={false}
        endCursor={null}
        loadingMore={false}
        fetchError={null}
        clearError={() => undefined}
        onLoadMore={async () => undefined}
      >
        <PostList />
      </InfiniteScroll>
    </StoryFrame>
  ),
}

export const MoreAvailable: Story = {
  render: () => (
    <StoryFrame>
      <InfiniteScroll
        hasNextPage
        endCursor='cursor-discussions'
        loadingMore={false}
        fetchError={null}
        clearError={() => undefined}
        onLoadMore={async () => true}
      >
        <PostList />
      </InfiniteScroll>
    </StoryFrame>
  ),
}
