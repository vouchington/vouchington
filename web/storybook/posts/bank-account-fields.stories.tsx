import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { BankAccountFields } from '@/components/posts/bank-account-fields'
import {
  clearTopicSearchFixture,
  setTopicSearchFixture,
} from '@/storybook/mocks/client-api-instance'
import { StoryFrame } from '@/storybook/story-frame'
import { bankAccountData, bankTopic } from './fixtures'

const meta = {
  title: 'Posts/Bank Account Fields',
  component: BankAccountFields,
  beforeEach() {
    setTopicSearchFixture()
    return () => clearTopicSearchFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj

const deniedAccount: Record<string, unknown> = {
  currency: 'usd',
  topic_ids: [bankTopic.id],
  topic_name: bankTopic.name,
  result: 'denied',
  existing_relationship: false,
  direct_deposit_setup: false,
}

function BankAccountStory({ data }: { data: Record<string, unknown> }) {
  const [current, setCurrent] = useState(data)
  return (
    <StoryFrame width='max-w-xl'>
      <BankAccountFields
        data={current}
        onUpdate={(key, value) => setCurrent(previous => ({ ...previous, [key]: value }))}
      />
    </StoryFrame>
  )
}

export const ApprovedSavings: Story = {
  render: () => <BankAccountStory data={bankAccountData} />,
}

export const Denied: Story = {
  render: () => <BankAccountStory data={deniedAccount} />,
}
