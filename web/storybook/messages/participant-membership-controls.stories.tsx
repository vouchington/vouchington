import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import {
  ParticipantAddForm,
  ParticipantPolicyControls,
} from '@/components/messages/participant-membership-controls'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Messages/Participant Membership Controls',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const idle = fn()

export const Controls: Story = {
  render: () => (
    <StoryFrame width='max-w-md'>
      <div className='space-y-4'>
        <ParticipantAddForm
          existingUserIds={new Set()}
          onAdd={idle}
        />
        <ParticipantPolicyControls
          policy='owner_only'
          updating={false}
          onPolicyChange={async () => {
            idle()
          }}
        />
      </div>
    </StoryFrame>
  ),
}
