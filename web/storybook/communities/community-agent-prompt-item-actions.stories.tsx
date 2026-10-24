import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { CommunityAgentPromptItemActions } from '@/components/communities/community-agent-prompt-item-actions'
import type { CommunityAgentPrompt } from '@/lib/api/client/community-agent-prompts'
import { useTranslations } from '@/lib/i18n/use-translations'
import { communities } from '@/storybook/entities/fixtures/communities'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Community Agent Prompt Item Actions',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const prompt: CommunityAgentPrompt = {
  id: 'prompt-referral-filter',
  community_id: communities[0]!.id,
  created_by_id: publicUsers[0]!.id,
  agent_id: 'agent-community-mod',
  prompt: 'Flag bare referral links without a personal review.',
  model_name: 'gpt-4.1-mini',
  model_provider: 'openai',
  is_slot_allocated: true,
  activated_at: '2026-04-02T15:00:00.000Z',
  deactivated_at: null,
  created_at: '2026-04-02T15:00:00.000Z',
  updated_at: '2026-05-01T12:00:00.000Z',
  deleted_at: null,
  deleted_by_id: null,
}

const actions = {
  onSaveEdit: fn(),
  onCancelEdit: fn(),
  onStartEdit: fn(),
  onToggleAllocation: fn(),
  onToggleTesting: fn(),
  onRequestDelete: fn(),
  onDelete: fn(),
}

function ActionsPreview({
  isEditing,
  confirmDelete,
}: {
  isEditing: boolean
  confirmDelete: boolean
}) {
  const t = useTranslations()
  return (
    <StoryFrame>
      <CommunityAgentPromptItemActions
        {...actions}
        prompt={prompt}
        isEditing={isEditing}
        confirmDelete={confirmDelete}
        disabled={false}
        t={t}
      />
    </StoryFrame>
  )
}

export const Ready: Story = {
  render: () => (
    <ActionsPreview
      isEditing={false}
      confirmDelete={false}
    />
  ),
}

export const Editing: Story = {
  render: () => (
    <ActionsPreview
      isEditing
      confirmDelete={false}
    />
  ),
}

export const ConfirmDeletion: Story = {
  render: () => (
    <ActionsPreview
      isEditing={false}
      confirmDelete
    />
  ),
}
