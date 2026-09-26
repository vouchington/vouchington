import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Button } from '@/components/ui/button'
import { NewsItemStoryCard } from '@/components/news/news-item-cluster-story-card'
import { getCanonicalPostPath } from '@/lib/post-helpers'
import { StoryFrame } from '@/storybook/story-frame'
import { newsItems, newsResponse } from '@/storybook/entities/fixtures/feeds'
import { publicUsers, storyCurrentUser } from '@/storybook/entities/fixtures/users'
import {
  clearStoryDiscussionFixture,
  setStoryDiscussionFixture,
} from '@/storybook/mocks/story-discussion-fixture'

const meta = {
  title: 'News/News Item Story Card',
  beforeEach() {
    setStoryDiscussionFixture()
    return () => clearStoryDiscussionFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const transferBonus = newsResponse.stories?.['story-transfer-bonus']
const primary = newsItems[0]!
const related = [newsItems[3]!]

function StoryCard({ signedIn }: { signedIn: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [storyPostHref, setStoryPostHref] = useState<string | null>(
    signedIn
      ? null
      : getCanonicalPostPath({
          id: 'fixture-story',
          post_type: 'story',
          slug: 'fixture-story',
        }),
  )
  return (
    <NewsItemStoryCard
      story={transferBonus}
      storyPostHref={storyPostHref}
      onStoryDiscussionCreated={setStoryPostHref}
      storyItems={related}
      primary={primary}
      view='compact'
      sharedByUser={publicUsers[0]}
      sharedAt='2026-09-18T11:00:00.000Z'
      isExpanded={isExpanded}
      setExpanded={setIsExpanded}
      storyItemsId='transfer-bonus-related'
      renderOfficialBadge={() => null}
      renderPrimaryActions={() => (
        <Button
          type='button'
          variant='ghost'
          size='sm'
        >
          Save article
        </Button>
      )}
      renderActions={() => (
        <Button
          type='button'
          variant='ghost'
          size='sm'
        >
          Save article
        </Button>
      )}
      filteredStoryItemActionContexts={{}}
    />
  )
}

export const SignedIn: Story = {
  parameters: { auth: { currentUser: storyCurrentUser } },
  render: () => (
    <StoryFrame>
      <StoryCard signedIn />
    </StoryFrame>
  ),
}

export const SignedOut: Story = {
  parameters: { auth: { currentUser: null } },
  render: () => (
    <StoryFrame>
      <StoryCard signedIn={false} />
    </StoryFrame>
  ),
}
