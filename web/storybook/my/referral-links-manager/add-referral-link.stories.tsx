import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AddReferralLink } from '@/components/my/referral-links-manager/add-referral-link'
import {
  clearTopicSearchFixture,
  setTopicSearchFixture,
} from '@/storybook/mocks/client-api-instance'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'My/Add Referral Link',
  beforeEach() {
    setTopicSearchFixture()
    return () => clearTopicSearchFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function ProgramSearch() {
  const [programId, setProgramId] = useState<string | null>(null)
  if (programId) return <p>Selected program {programId}</p>
  return <AddReferralLink onSelectProgram={setProgramId} />
}

export const SearchPrograms: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <ProgramSearch />
    </StoryFrame>
  ),
}
