import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TotpSetupFlow, type TotpSetupData } from '@/components/my/totp-manager/setup-flow'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'My/Totp Setup Flow',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function NameStepForm({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName)
  const [setupData, setSetupData] = useState<TotpSetupData | null>(null)
  const [setupCode, setSetupCode] = useState('')
  const [step, setStep] = useState<'setup' | 'list'>('setup')
  if (step === 'list') return <p>Returned to authenticators</p>
  return (
    <TotpSetupFlow
      loading={false}
      setupCode={setupCode}
      setupData={setupData}
      setupName={name}
      onStartSetup={event => {
        event.preventDefault()
        setSetupData({
          authenticator: {
            id: 'totp-story',
            name: name || 'Authenticator',
            created_at: '2026-05-01T12:00:00.000Z',
          },
          secret: 'STORYBOOKSECRET',
          uri: 'otpauth://totp/Voucha:story?secret=STORYBOOKSECRET&issuer=Voucha',
        })
      }}
      onVerifySetup={() => setStep('list')}
      setSetupCode={setSetupCode}
      setSetupData={setSetupData}
      setSetupName={setName}
      setStep={() => setStep('list')}
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
