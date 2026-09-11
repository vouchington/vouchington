import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { ModeratorVacationDurationControl } from '@/components/communities/community-moderator-vacation-controls'

const options = [
  { value: 'indefinite', label: 'Until I turn it off' },
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
]

const meta = {
  title: 'Communities/Moderator Vacation/Duration Control',
  component: ModeratorVacationDurationControl,
  args: {
    disabled: false,
    label: 'Return date',
    options,
    onChange: fn(),
  },
} satisfies Meta<typeof ModeratorVacationDurationControl>

export default meta
type Story = StoryObj<typeof meta>

export const Indefinite: Story = { args: { duration: 'indefinite' } }

export const TwoWeeks: Story = { args: { duration: '14' } }

export const Updating: Story = { args: { duration: '7', disabled: true } }
