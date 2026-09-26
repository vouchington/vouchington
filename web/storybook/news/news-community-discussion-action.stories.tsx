import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NewsCommunityDiscussionAction } from '@/components/news/news-community-discussion-action'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import { communities } from '@/storybook/entities/fixtures/communities'
import { newsItems } from '@/storybook/entities/fixtures/feeds'

const meta = {
  title: 'News/News Community Discussion Action',
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
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

function DiscussionAction({ variant }: { variant: 'button' | 'menu-item' }) {
  const [href, setHref] = useState<string | null>(null)
  if (href) return <p>Discussion started at {href}</p>
  return (
    <NewsCommunityDiscussionAction
      variant={variant}
      fixedCommunity={fixedCommunity}
      itemTitle={article.data.title ?? 'Bank launches transfer bonus'}
      onCreated={setHref}
      relatedUrls={relatedUrls}
    />
  )
}

export const DiscussButton: Story = {
  render: () => (
    <StoryFrame width='max-w-md'>
      <DiscussionAction variant='button' />
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
          <DiscussionAction variant='menu-item' />
        </DropdownMenuContent>
      </DropdownMenu>
    </StoryFrame>
  ),
}
