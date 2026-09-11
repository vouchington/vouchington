import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunityModlogPanel } from '@/components/communities/community-modlog-panel'
import type { Community, ModlogResponseBody } from '@/types/api-responses'

const community = {
  id: '019000000000000000000000001',
  slug: 'test-community',
  name: 'Test Community',
} as Community

const emptyData: ModlogResponseBody = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  moderator_actions: {},
  users: {},
}

const dataWithActions: ModlogResponseBody = {
  results: [
    { __entity_type: 'moderator_action', id: '019000000000000000000000011' },
    { __entity_type: 'moderator_action', id: '019000000000000000000000012' },
  ],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  moderator_actions: {
    '019000000000000000000000011': {
      id: '019000000000000000000000011',
      community_id: '019000000000000000000000001',
      actor_id: '019000000000000000000000021',
      action_type: 'ban',
      post_id: null,
      target_user_id: '019000000000000000000000031',
      report_id: null,
      review_dispute_id: null,
      community_application_id: null,
      reason: 'Repeated spam',
      metadata: {},
      created_at: '2026-06-01T10:00:00.000Z',
    },
    '019000000000000000000000012': {
      id: '019000000000000000000000012',
      community_id: '019000000000000000000000001',
      actor_id: '019000000000000000000000021',
      action_type: 'remove',
      post_id: '019000000000000000000000041',
      target_user_id: null,
      report_id: null,
      review_dispute_id: null,
      community_application_id: null,
      reason: null,
      metadata: {},
      created_at: '2026-06-01T09:00:00.000Z',
    },
  },
  users: {
    '019000000000000000000000021': {
      id: '019000000000000000000000021',
      username: 'moderator_jane',
    } as any,
  },
}

const meta = {
  title: 'Communities/Community Modlog Panel',
  component: CommunityModlogPanel,
  parameters: { auth: { currentUser: null } },
} satisfies Meta<typeof CommunityModlogPanel>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {
  args: {
    community,
    initialData: emptyData,
  },
}

export const WithActions: Story = {
  args: {
    community,
    initialData: dataWithActions,
  },
}
