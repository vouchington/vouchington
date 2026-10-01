import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunityAutomodFlagsPanel } from '@/components/communities/community-automod-flags-panel'
import type { CommunityModerationQueueEntry } from '@/types/api-responses'
import { communities } from '@/storybook/entities/fixtures/communities'
import { posts } from '@/storybook/entities/fixtures/posts'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Community Automod Flags Panel',
  component: CommunityAutomodFlagsPanel,
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta<typeof CommunityAutomodFlagsPanel>

export default meta
type Story = StoryObj<typeof meta>

function flagEntry(post: (typeof posts)[number]): CommunityModerationQueueEntry {
  return {
    id: post.id,
    created_at: '2026-09-26T12:00:00.000Z',
    entity_type: 'post',
    entity_id: post.id,
    queue_source: 'automod_flag',
    reason: null,
    report_count: 0,
    resolved_by_id: null,
    status: 'pending',
    target_available: true,
    target_label: post.title,
    target_content: {
      kind: 'post',
      text: post.title,
      declared_language: 'en',
      lingua_rs_detected_language: 'en',
    },
    target_path: `/discussion/${post.id}`,
    target_user_id: publicUsers[0]!.id,
    judgement: null,
    post_moderation_context: null,
    community_ban_evasion: null,
    is_system_generated: false,
  }
}

export const OpenFlags: Story = {
  args: {
    communitySlug: communities[0]!.slug,
    entries: [flagEntry(posts[0]!), { ...flagEntry(posts[1]!), target_path: null }],
  },
  render: args => (
    <StoryFrame>
      <CommunityAutomodFlagsPanel {...args} />
    </StoryFrame>
  ),
}
