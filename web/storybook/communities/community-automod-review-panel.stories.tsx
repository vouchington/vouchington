import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunityAutomodReviewPanel } from '@/components/communities/community-automod-review-panel'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import type { CommunityAutomodAction } from '@/types/api-responses'
import { communities } from '@/storybook/entities/fixtures/communities'
import { posts } from '@/storybook/entities/fixtures/posts'
import { getCanonicalPostPath } from '@/lib/post-helpers'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Community Automod Review Panel',
  component: CommunityAutomodReviewPanel,
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta<typeof CommunityAutomodReviewPanel>

export default meta
type Story = StoryObj<typeof meta>

const review = posts[1]!

const action: CommunityAutomodAction = {
  source_key: `community-prompt:${review.id}`,
  source_type: 'community_prompt',
  post_id: review.id,
  community_id: communities[0]!.id,
  agent_moderation_id: 'agent-mod-referral',
  moderator_slug: 'referral-filter',
  title: review.title,
  authored_title: review.title,
  declared_language: 'en',
  lingua_rs_detected_language: 'en',
  markdown_preview:
    'Use my Sapphire Reserve referral before you apply. I did not include a spend category or approval data point.',
  post_type: review.post_type,
  post_href: getCanonicalPostPath(review),
  created_at: review.created_at,
  action_at: '2026-05-11T18:05:00.000Z',
  confidence_score: 0.64,
  flagged: true,
  reason: 'Referral link without a personal data point',
  categories: ['referral', 'promotional'],
  model_output: null,
  current_state: 'rejected',
  feedback_label: null,
}

const stats = { total_count: 12, false_positive_count: 2, false_positive_rate: 2 / 12 }

export const LowConfidenceRemoval: Story = {
  args: { actions: [action], communitySlug: communities[0]!.slug, stats },
  render: args => (
    <StoryFrame>
      <CommunityAutomodReviewPanel {...args} />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  args: { actions: [], communitySlug: communities[0]!.slug, stats },
  render: args => (
    <StoryFrame>
      <CommunityAutomodReviewPanel {...args} />
    </StoryFrame>
  ),
}
