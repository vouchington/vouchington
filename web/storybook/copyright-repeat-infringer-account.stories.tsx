import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { RepeatInfringerAccount } from '@/components/copyright/copyright-repeat-infringer-account'

const account = {
  account_user_id: '019f0000-0000-7000-8000-0000000000a1',
  incident_id: '019f0000-0000-7000-8000-0000000000a2',
  is_operative: true,
  open_review_id: null,
  termination_in_effect: false,
}

const meta = {
  title: 'Copyright/Repeat Infringer Account',
  component: RepeatInfringerAccount,
  args: {
    account,
    canAdminister: true,
    canSubmit: true,
    pending: false,
    rationale: 'Reviewed the incident record.',
    submit: fn(),
  },
} satisfies Meta<typeof RepeatInfringerAccount>

export default meta
type Story = StoryObj<typeof meta>

export const OperativeIncident: Story = {}

export const OpenReview: Story = {
  args: {
    account: {
      ...account,
      is_operative: false,
      open_review_id: '019f0000-0000-7000-8000-0000000000a3',
    },
  },
}

export const TerminationInEffect: Story = {
  args: { account: { ...account, is_operative: false, termination_in_effect: true } },
}
