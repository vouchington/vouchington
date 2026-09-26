import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { RssFeedItemModalHeader } from '@/components/rss-feed-items/rss-feed-item-modal-header'
import { Dialog, DialogContent, DialogDescription } from '@/components/ui/dialog'
import { StoryFrame } from '@/storybook/story-frame'
import { posts } from '@/storybook/entities/fixtures/posts'
import { topics } from '@/storybook/entities/fixtures/topics'

const article = posts.find(post => post.post_type === 'article')!
const feed = topics.find(topic => topic.topic_type === 'rss_feed')!

const meta = {
  title: 'RSS Feed Items/Modal Header',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function HeaderStory({ titleUrl }: { titleUrl?: string }) {
  return (
    <StoryFrame>
      <Dialog
        open
        onOpenChange={() => undefined}
      >
        <DialogContent>
          <RssFeedItemModalHeader
            title={article.title}
            titleUrl={titleUrl}
            headerDetails={<p className='text-sm text-muted-foreground'>{feed.name}</p>}
          />
          <DialogDescription className='sr-only'>RSS item detail</DialogDescription>
        </DialogContent>
      </Dialog>
    </StoryFrame>
  )
}

export const LinkedTitle: Story = {
  render: () => <HeaderStory titleUrl='https://fintech.example/guides/transfer-partners' />,
}

export const PlainTitle: Story = {
  render: () => <HeaderStory />,
}
