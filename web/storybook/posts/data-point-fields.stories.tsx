import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DataPointFields, type DataPointVertical } from '@/components/posts/data-point-fields'
import { StoryFrame } from '@/storybook/story-frame'
import { bankAccountData, creditCardData, financialProfile } from './fixtures'

const meta = {
  title: 'Posts/Data Point Fields',
  component: DataPointFields,
} satisfies Meta

export default meta
type Story = StoryObj

function DataPointStory({
  initialVertical,
  data,
}: {
  initialVertical: DataPointVertical
  data: Record<string, unknown>
}) {
  const [vertical, setVertical] = useState(initialVertical)
  const [structuredData, setStructuredData] = useState(data)
  const [saveToProfile, setSaveToProfile] = useState(true)
  return (
    <StoryFrame width='max-w-xl'>
      <DataPointFields
        vertical={vertical}
        onVerticalChange={setVertical}
        structuredData={structuredData}
        onStructuredDataChange={setStructuredData}
        userFinancialProfile={financialProfile}
        saveToProfile={saveToProfile}
        onSaveToProfileChange={setSaveToProfile}
      />
    </StoryFrame>
  )
}

export const CreditCard: Story = {
  render: () => (
    <DataPointStory
      initialVertical='credit_card'
      data={creditCardData}
    />
  ),
}

export const BankAccount: Story = {
  render: () => (
    <DataPointStory
      initialVertical='bank_account'
      data={bankAccountData}
    />
  ),
}
