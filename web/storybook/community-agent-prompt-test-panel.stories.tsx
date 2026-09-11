import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunityAgentPromptTestPanel } from '@/components/communities/community-agent-prompt-test-panel'
import type { CommunityAgentPrompt } from '@/lib/api/client/community-agent-prompts'

const prompt = {
  id: '019000000000000000000000101',
  community_id: '019000000000000000000000001',
  created_by_id: '019000000000000000000000002',
  agent_id: '019000000000000000000000003',
  prompt: 'Flag posts that repeatedly ask members to follow unrelated referral links.',
  model_name: 'gpt-5.4-nano',
  model_provider: 'openai',
  slot_allocated: true,
  on_flag_action: 'unpublish',
  activated_at: null,
  deactivated_at: null,
  created_at: '2026-06-01T10:00:00.000Z',
  updated_at: '2026-06-01T10:00:00.000Z',
  deleted_at: null,
  deleted_by_id: null,
} satisfies CommunityAgentPrompt

const meta = {
  title: 'Communities/Community Agent Prompt Test Panel',
  component: CommunityAgentPromptTestPanel,
  parameters: { auth: { currentUser: null } },
} satisfies Meta<typeof CommunityAgentPromptTestPanel>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    prompt,
    communitySlug: 'credit-cards',
  },
}
