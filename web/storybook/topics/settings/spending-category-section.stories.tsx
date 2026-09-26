import type { FormEvent } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SpendingCategorySection } from '@/components/topics/settings/spending-category-section'
import { StoryFrame } from '@/storybook/story-frame'

const prevent = (event: FormEvent) => event.preventDefault()

const meta = {
  title: 'Topics/Spending Category',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ForeignMonthly: Story = {
  render: () => (
    <StoryFrame>
      <SpendingCategorySection
        isForeignTransaction
        spendingFrequency='monthly'
        spendingSaving={false}
        onSpendingSubmit={prevent}
        setIsForeignTransaction={() => undefined}
        setSpendingFrequency={() => undefined}
      />
    </StoryFrame>
  ),
}

export const DomesticYearly: Story = {
  render: () => (
    <StoryFrame>
      <SpendingCategorySection
        isForeignTransaction={false}
        spendingFrequency='yearly'
        spendingSaving={false}
        onSpendingSubmit={prevent}
        setIsForeignTransaction={() => undefined}
        setSpendingFrequency={() => undefined}
      />
    </StoryFrame>
  ),
}
