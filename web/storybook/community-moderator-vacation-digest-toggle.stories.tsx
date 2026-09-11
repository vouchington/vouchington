import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { ModeratorVacationDigestToggle } from '@/components/communities/community-moderator-vacation-controls'

const meta = {
  title: 'Communities/Moderator Vacation/Digest Toggle',
  component: ModeratorVacationDigestToggle,
  args: {
    disabled: false,
    label: 'Pause community digests while on vacation',
    description:
      'Weekly activity and moderation summaries pause only while vacation mode is active.',
    onChange: fn(),
  },
} satisfies Meta<typeof ModeratorVacationDigestToggle>

export default meta
type Story = StoryObj<typeof meta>

export const DigestsContinue: Story = { args: { checked: false } }

export const DigestsPaused: Story = { args: { checked: true } }

export const Updating: Story = { args: { checked: true, disabled: true } }
