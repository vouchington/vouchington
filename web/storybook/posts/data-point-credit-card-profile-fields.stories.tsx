import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DataPointCreditCardProfileFields } from '@/components/posts/data-point-credit-card-profile-fields'
import type { FinancialProfile } from '@/types/my'
import { StoryFrame } from '@/storybook/story-frame'
import { financialProfile } from './fixtures'

const meta = {
  title: 'Posts/Data Point Credit Card Profile Fields',
  component: DataPointCreditCardProfileFields,
} satisfies Meta

export default meta
type Story = StoryObj

function ProfileStory({
  data,
  profile,
}: {
  data: Record<string, unknown>
  profile?: FinancialProfile | null
}) {
  const [current, setCurrent] = useState(data)
  return (
    <StoryFrame width='max-w-xl'>
      <DataPointCreditCardProfileFields
        data={current}
        userFinancialProfile={profile}
        onUpdate={(key, value) => setCurrent(previous => ({ ...previous, [key]: value }))}
      />
    </StoryFrame>
  )
}

export const FromProfile: Story = {
  render: () => (
    <ProfileStory
      data={{}}
      profile={financialProfile}
    />
  ),
}

export const Empty: Story = {
  render: () => <ProfileStory data={{}} />,
}
