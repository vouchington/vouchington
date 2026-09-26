import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ValuationSummary } from '@/components/my/point-valuations-manager/valuation-summary'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'
import type { PointValuation } from '@/types/my'

const meta = {
  title: 'My/Valuation Summary',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const ultimateRewards = topics[3]!

const valuation: PointValuation = {
  id: 'valuation-ultimate-rewards',
  rewards_program_id: ultimateRewards.id,
  value_per_point: { amount: 15_000, currency: 'usd', scale: 6 },
  note: 'What I use for international business class.',
  rewards_program: {
    id: ultimateRewards.id,
    name: ultimateRewards.name,
    slug: ultimateRewards.slug,
  },
}

export const UltimateRewards: Story = {
  render: () => (
    <StoryFrame>
      <ValuationSummary
        confirmingDeleteId={null}
        loading={false}
        onCancelDelete={() => {}}
        onConfirmDelete={() => {}}
        onStartDelete={() => {}}
        onStartEdit={() => {}}
        valuation={valuation}
      />
    </StoryFrame>
  ),
}

export const ConfirmingRemoval: Story = {
  render: () => (
    <StoryFrame>
      <ValuationSummary
        confirmingDeleteId={valuation.id}
        loading={false}
        onCancelDelete={() => {}}
        onConfirmDelete={() => {}}
        onStartDelete={() => {}}
        onStartEdit={() => {}}
        valuation={valuation}
      />
    </StoryFrame>
  ),
}
