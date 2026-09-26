import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NewsCommunityDiscussionAction } from '@/components/news/news-community-discussion-action'
import { StoryFrame } from '@/storybook/story-frame'
import { communities } from '@/storybook/entities/fixtures/communities'
import { newsItems } from '@/storybook/entities/fixtures/feeds'

const meta = {
  title: 'News/News Community Discussion Action',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const creditCards = communities[0]!
const article = newsItems[0]!
const fixedCommunity = {
  id: creditCards.id,
  name: creditCards.name,
  slug: creditCards.slug,
  visibility: 'public' as const,
}
const relatedUrls = [article.url]

export const DiscussButton: Story = {
  render: () => (
    <StoryFrame width='max-w-md'>
      <NewsCommunityDiscussionAction
        variant='button'
        fixedCommunity={fixedCommunity}
        itemTitle={article.data.title ?? 'Bank launches transfer bonus'}
        relatedUrls={relatedUrls}
      />
    </StoryFrame>
  ),
}

export const MenuItem: Story = {
  render: () => (
    <StoryFrame width='max-w-md'>
      <DropdownMenu
        open
        modal={false}
        onOpenChange={() => {}}
      >
        <DropdownMenuTrigger asChild>
          <Button
            type='button'
            variant='outline'
          >
            Discuss
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <NewsCommunityDiscussionAction
            variant='menu-item'
            fixedCommunity={fixedCommunity}
            itemTitle={article.data.title ?? 'Bank launches transfer bonus'}
            relatedUrls={relatedUrls}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </StoryFrame>
  ),
}
