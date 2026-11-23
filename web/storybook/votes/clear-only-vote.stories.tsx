import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ClearOnlyVote } from '@/components/votes/clear-only-vote'
import type { ScoreVoteState } from '@/components/votes/score-vote-types'
import { StoryFrame } from '@/storybook/story-frame'

const handleClear = fn(async () => {})

const meta = {
  title: 'Votes/Clear Only Vote',
  component: ClearOnlyVote,
  beforeEach() {
    handleClear.mockClear()
  },
  render: args => (
    <StoryFrame>
      <ClearOnlyVote {...args} />
    </StoryFrame>
  ),
} satisfies Meta<typeof ClearOnlyVote>

export default meta
type Story = StoryObj<typeof meta>

const vote: ScoreVoteState = {
  currentVote: 'like',
  countUp: 1234,
  countDown: 7,
  isLoading: false,
  handleVote: async () => {},
  handleClear,
}

export const ExistingVote: Story = {
  args: { dataPw: 'storybook-clear-only', vote },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/\+1,234/)).toBeVisible()
    await expect(canvas.getByText(/−7/)).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Clear' }))
    await expect(handleClear).toHaveBeenCalledTimes(1)
  },
}

export const HiddenDownCount: Story = {
  args: { dataPw: 'storybook-clear-only-hidden-down', hideDownCount: true, vote },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/\+1,234/)).toBeVisible()
    await expect(canvas.queryByText(/−7/)).toBeNull()
  },
}

export const LoadingDisablesClear: Story = {
  args: { dataPw: 'storybook-clear-only-loading', vote: { ...vote, isLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const clear = canvas.getByRole('button', { name: 'Clear' })
    await expect(clear).toBeDisabled()
    await expect(handleClear).not.toHaveBeenCalled()
  },
}
