import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Button } from '@/components/ui/button'
import { NewsItemClusterRelatedItems } from '@/components/news/news-item-cluster-related-items'
import { StoryFrame } from '@/storybook/story-frame'
import { newsItems } from '@/storybook/entities/fixtures/feeds'

const meta = {
  title: 'News/News Item Cluster Related Items',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const articles = [newsItems[0]!, newsItems[3]!]

function Related({ expanded, items }: { expanded: boolean; items: typeof articles }) {
  const [isExpanded, setIsExpanded] = useState(expanded)
  return (
    <NewsItemClusterRelatedItems
      isExpanded={isExpanded}
      renderActions={() => (
        <Button
          type='button'
          variant='ghost'
          size='sm'
        >
          Save article
        </Button>
      )}
      renderOfficialBadge={() => null}
      setExpanded={setIsExpanded}
      storyItemActionContexts={{}}
      storyItems={items}
      storyItemsId='transfer-bonus-related'
      view='compact'
    />
  )
}

export const Collapsed: Story = {
  render: () => (
    <StoryFrame>
      <Related
        expanded={false}
        items={articles}
      />
    </StoryFrame>
  ),
}

export const Expanded: Story = {
  render: () => (
    <StoryFrame>
      <Related
        expanded
        items={articles}
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <Related
        expanded={false}
        items={[]}
      />
    </StoryFrame>
  ),
}
