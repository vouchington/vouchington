import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CreditCardFields } from '@/components/posts/credit-card-fields'
import { StoryFrame } from '@/storybook/story-frame'
import { cardTopic, creditCardData } from './fixtures'

const meta = {
  title: 'Posts/Credit Card Fields',
  component: CreditCardFields,
} satisfies Meta

export default meta
type Story = StoryObj

const deniedCard: Record<string, unknown> = {
  currency: 'usd',
  topic_ids: [cardTopic.id],
  topic_name: cardTopic.name,
  result: 'denied',
  existing_relationship: false,
  is_business_application: false,
}

function CreditCardStory({ data }: { data: Record<string, unknown> }) {
  const [current, setCurrent] = useState(data)
  return (
    <StoryFrame width='max-w-xl'>
      <CreditCardFields
        data={current}
        onUpdate={(key, value) => setCurrent(previous => ({ ...previous, [key]: value }))}
      />
    </StoryFrame>
  )
}

export const Approved: Story = {
  render: () => <CreditCardStory data={creditCardData} />,
}

export const Denied: Story = {
  render: () => <CreditCardStory data={deniedCard} />,
}
