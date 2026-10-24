import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { IntegrityPenaltiesClient } from '@/components/admin/integrity-penalties-client'
import type { IntegrityPenaltyRecord } from '@/components/admin/use-integrity-penalties'
import { StoryFrame } from '@/storybook/story-frame'

const penalty: IntegrityPenaltyRecord = {
  id: 'storybook-penalty',
  user_id: 'storybook-user',
  reason: 'voting_ring',
  source_flag_id: 'storybook-flag',
  created_by_id: 'storybook-admin',
  revoked_at: null,
  revoked_by_id: null,
  created_at: '2026-06-05T17:40:00.000Z',
}

const meta = {
  title: 'Admin/Integrity Penalties Client',
  component: IntegrityPenaltiesClient,
} satisfies Meta<typeof IntegrityPenaltiesClient>

export default meta
type Story = StoryObj<typeof meta>

export const ActivePenalty: Story = {
  args: {
    domain: 'vote',
    endpoint: '/api/v1/vote-integrity/penalties',
    flagsPath: '/vote-integrity/flags',
    initialData: {
      results: [penalty],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    },
    initialStatus: 'active',
    multiplier: () => '0.25×',
    penaltiesPath: '/vote-integrity/penalties',
    getById: async () => ({ penalty }),
    revoke: async () => ({ penalty }),
  },
  render: args => (
    <StoryFrame width='max-w-5xl'>
      <IntegrityPenaltiesClient {...args} />
    </StoryFrame>
  ),
}
