import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DataPointProfileFields } from '@/components/posts/data-point-profile-fields'
import type { DataPointVertical } from '@/components/posts/data-point-fields'
import { StoryFrame } from '@/storybook/story-frame'
import { bankAccountData, creditCardData, financialProfile } from './fixtures'

const meta = {
  title: 'Posts/Data Point Profile Fields',
  component: DataPointProfileFields,
} satisfies Meta

export default meta
type Story = StoryObj

function ProfileFieldsStory({
  vertical,
  data,
}: {
  vertical: DataPointVertical
  data: Record<string, unknown>
}) {
  const [current, setCurrent] = useState(data)
  const [saveToProfile, setSaveToProfile] = useState(vertical === 'credit_card')
  return (
    <StoryFrame width='max-w-xl'>
      <DataPointProfileFields
        vertical={vertical}
        data={current}
        onUpdate={(key, value) => setCurrent(previous => ({ ...previous, [key]: value }))}
        userFinancialProfile={financialProfile}
        saveToProfile={saveToProfile}
        onSaveToProfileChange={setSaveToProfile}
      />
    </StoryFrame>
  )
}

export const CreditCard: Story = {
  render: () => (
    <ProfileFieldsStory
      vertical='credit_card'
      data={creditCardData}
    />
  ),
}

export const BankAccount: Story = {
  render: () => (
    <ProfileFieldsStory
      vertical='bank_account'
      data={bankAccountData}
    />
  ),
}
