import type { FormEvent } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { BasicInfoSection } from '@/components/topics/settings/basic-info-section'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'

const topic = topics[0]!
const prevent = (event: FormEvent) => event.preventDefault()

const meta = {
  title: 'Topics/Basic Info',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const OpenBanking: Story = {
  render: () => (
    <StoryFrame>
      <BasicInfoSection
        topic={topic}
        basicSaving={false}
        onBasicSubmit={prevent}
      />
    </StoryFrame>
  ),
}

export const Saving: Story = {
  render: () => (
    <StoryFrame>
      <BasicInfoSection
        topic={topics[1]!}
        basicSaving
        onBasicSubmit={prevent}
      />
    </StoryFrame>
  ),
}
