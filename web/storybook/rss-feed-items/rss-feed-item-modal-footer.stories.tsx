import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { RssFeedItemModalFooter } from '@/components/rss-feed-items/rss-feed-item-modal-footer'
import { StoryFrame } from '@/storybook/story-frame'
import { posts } from '@/storybook/entities/fixtures/posts'

const previousButtonRef = { current: null as HTMLButtonElement | null }
const nextButtonRef = { current: null as HTMLButtonElement | null }
const article = posts.find(post => post.post_type === 'article')!

const meta = {
  title: 'RSS Feed Items/Modal Footer',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const BetweenItems: Story = {
  render: () => (
    <StoryFrame>
      <RssFeedItemModalFooter
        actions={<p className='truncate text-sm text-muted-foreground'>{article.title}</p>}
        canNavigateNext
        canNavigatePrevious
        navigateNext={() => true}
        navigatePrevious={() => true}
        nextButtonRef={nextButtonRef}
        previousButtonRef={previousButtonRef}
      />
    </StoryFrame>
  ),
}

export const FirstItem: Story = {
  render: () => (
    <StoryFrame>
      <RssFeedItemModalFooter
        actions={<p className='truncate text-sm text-muted-foreground'>{article.title}</p>}
        canNavigateNext
        canNavigatePrevious={false}
        navigateNext={() => true}
        navigatePrevious={() => false}
        nextButtonRef={nextButtonRef}
        previousButtonRef={previousButtonRef}
      />
    </StoryFrame>
  ),
}
