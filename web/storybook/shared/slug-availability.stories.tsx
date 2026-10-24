import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { SlugAvailability } from '@/components/shared/slug-availability'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Shared/Slug Availability',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Available: Story = {
  render: () => (
    <StoryFrame width='max-w-md'>
      <SlugAvailability
        kind='community-slug'
        state={{ status: 'available', conflict: null }}
      />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/community slug/i)).toBeVisible()
  },
}

export const TopicConflict: Story = {
  render: () => (
    <StoryFrame width='max-w-md'>
      <SlugAvailability
        kind='topic-slug'
        state={{
          status: 'taken',
          conflict: {
            kind: 'topic',
            id: 'topic-chase',
            slug: 'chase',
            name: 'Chase',
            topic_type: 'company',
          },
        }}
      />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link', { name: 'Chase' })).toBeVisible()
  },
}

export const CommunityConflict: Story = {
  render: () => (
    <StoryFrame width='max-w-md'>
      <SlugAvailability
        kind='community-slug'
        state={{
          status: 'taken',
          conflict: { kind: 'community', id: 'community-travel', slug: 'travel', name: 'Travel' },
        }}
      />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link', { name: 'Travel' })).toHaveAttribute(
      'href',
      expect.stringContaining('travel'),
    )
  },
}

export const PostConflict: Story = {
  render: () => (
    <StoryFrame width='max-w-md'>
      <SlugAvailability
        kind='post-slug'
        state={{
          status: 'taken',
          conflict: {
            kind: 'post',
            id: 'post-sapphire',
            slug: 'sapphire-reserve-review',
            title: 'Sapphire Reserve review',
            post_type: 'review',
          },
        }}
      />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('link', { name: 'Sapphire Reserve review' }),
    ).toBeVisible()
  },
}

export const UsernameConflictWithoutLink: Story = {
  render: () => (
    <StoryFrame width='max-w-md'>
      <SlugAvailability
        kind='username'
        state={{ status: 'taken', conflict: null }}
      />
    </StoryFrame>
  ),
}
