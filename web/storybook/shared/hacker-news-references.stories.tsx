import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { HackerNewsFilterToggle } from '@/components/hacker-news/hacker-news-filter-toggle'
import { HackerNewsReferenceLabel } from '@/components/hacker-news/hacker-news-reference-label'
import { HackerNewsReferencesAside } from '@/components/hacker-news/hacker-news-references-aside'
import { HackerNewsReferencesProvider } from '@/components/hacker-news/hacker-news-references-context'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Shared/Hacker News References',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const CardLabel: Story = {
  render: () => (
    <StoryFrame>
      <HackerNewsReferencesProvider
        references={{ 'item-1': { story_count: 3, comment_count: 12 } }}
      >
        <HackerNewsReferenceLabel entityId='item-1' />
      </HackerNewsReferencesProvider>
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Seen on Hacker News · 3')).toBeVisible()
  },
}

export const MentionedOnly: Story = {
  render: () => (
    <StoryFrame>
      <HackerNewsReferencesProvider references={{ 'item-1': { story_count: 0, comment_count: 2 } }}>
        <HackerNewsReferenceLabel entityId='item-1' />
      </HackerNewsReferencesProvider>
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Mentioned on Hacker News · 2')).toBeVisible()
  },
}

export const FilterToggle: Story = {
  render: () => (
    <StoryFrame>
      <HackerNewsFilterToggle />
    </StoryFrame>
  ),
}

export const DetailAside: Story = {
  render: () => (
    <StoryFrame>
      <HackerNewsReferencesAside
        references={{
          story_count: 1,
          comment_count: 1,
          stories: [
            {
              hacker_news_item_id: 4242,
              points: 17,
              reply_count: 5,
              posted_at: '2026-01-16T00:00:00.000Z',
            },
          ],
          comments: [
            {
              hacker_news_item_id: 4343,
              parent_story_item_id: 4242,
              posted_at: '2026-01-17T00:00:00.000Z',
            },
          ],
        }}
      />
    </StoryFrame>
  ),
}
