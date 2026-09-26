import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { RssFeedItemModalShell } from '@/components/rss-feed-items/rss-feed-item-modal-shell'
import { StoryFrame } from '@/storybook/story-frame'
import { posts } from '@/storybook/entities/fixtures/posts'
import { topics } from '@/storybook/entities/fixtures/topics'

const article = posts.find(post => post.post_type === 'article')!
const feed = topics.find(topic => topic.topic_type === 'rss_feed')!

const meta = {
  title: 'RSS Feed Items/Modal Shell',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const OpenItem: Story = {
  render: () => (
    <StoryFrame>
      <RssFeedItemModalShell
        title={article.title}
        titleUrl='https://fintech.example/guides/transfer-partners'
        currentItemId='rss-item-transfer-partners'
        closeUrl='/storybook'
        previousUrl='/storybook?rss_item=sapphire-reserve'
        nextUrl='/storybook?rss_item=family-trip'
        headerDetails={<p className='text-sm text-muted-foreground'>{feed.name}</p>}
        actions={<p className='truncate text-sm'>{article.title}</p>}
      >
        <article className='space-y-3 p-1 text-sm'>
          <p>{article.markdown}</p>
        </article>
      </RssFeedItemModalShell>
    </StoryFrame>
  ),
}

export const OnlyItem: Story = {
  render: () => (
    <StoryFrame>
      <RssFeedItemModalShell
        title={article.title}
        currentItemId='rss-item-transfer-partners'
        closeUrl='/storybook'
        headerDetails={<p className='text-sm text-muted-foreground'>{feed.name}</p>}
      >
        <article className='p-1 text-sm'>
          <p>{article.markdown}</p>
        </article>
      </RssFeedItemModalShell>
    </StoryFrame>
  ),
}
