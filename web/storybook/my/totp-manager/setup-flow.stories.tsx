import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TotpSetupFlow } from '@/components/my/totp-manager/setup-flow'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'My/Totp Setup Flow',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function NameStepForm({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName)
  return (
    <TotpSetupFlow
      loading={false}
      setupCode=''
      setupData={null}
      setupName={name}
      onStartSetup={event => event.preventDefault()}
      onVerifySetup={() => {}}
      setSetupCode={() => {}}
      setSetupData={() => {}}
      setSetupName={setName}
      setStep={() => {}}
    />
  )
}

export const NameStep: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <NameStepForm initialName='1Password' />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <NameStepForm initialName='' />
    </StoryFrame>
  ),
}
