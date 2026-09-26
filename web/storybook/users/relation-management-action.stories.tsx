import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { RelationManagementAction } from '@/components/users/relation-management-action'
import { USER_RELATION_ACTIONS } from '@/components/users/user-relation-actions'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'
import { publicUsers } from '@/storybook/entities/fixtures/users'

const topic = topics[0]!
const member = publicUsers[0]!

const meta = {
  title: 'Users/Relation Management Action',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const MutedTopic: Story = {
  render: () => (
    <StoryFrame>
      <RelationManagementAction
        entityId={topic.id}
        config={USER_RELATION_ACTIONS.topic.muted}
        onRemoved={() => undefined}
      />
    </StoryFrame>
  ),
}

export const BlockedMember: Story = {
  render: () => (
    <StoryFrame>
      <RelationManagementAction
        entityId={member.id}
        config={USER_RELATION_ACTIONS.user.blocked}
        onRemoved={() => undefined}
      />
    </StoryFrame>
  ),
}
