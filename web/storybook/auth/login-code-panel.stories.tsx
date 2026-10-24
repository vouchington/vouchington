import { useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { LoginCodePanel } from '@/components/auth/login-code-panel'
import { clearMfaStepFixture, setMfaStepFixture } from '@/storybook/mocks/mfa-step-fixture'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Auth/Login Code Panel',
  beforeEach() {
    setMfaStepFixture()
    return () => clearMfaStepFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const submitCode = fn(async (_value: string) => {})

function Panel({ initialStep }: { initialStep: 'code' | 'mfa' }) {
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code' | 'mfa'>(initialStep)
  const [loginAttemptId, setLoginAttemptId] = useState('login-attempt-cardholder')
  const submitting = useRef(false)

  return (
    <StoryFrame width='max-w-sm'>
      <LoginCodePanel
        active={step !== 'email'}
        code={code}
        email='cardholder@voucha.example'
        loading={false}
        loginAttemptId={loginAttemptId}
        onLoginSuccess={() => {}}
        onResendCode={async () => {}}
        setCode={setCode}
        setLoginAttemptId={setLoginAttemptId}
        setStep={setStep}
        setTurnstileToken={() => {}}
        step={step}
        submitCode={submitCode}
        submitting={submitting}
        turnstileReset={() => {}}
        turnstileToken='mock-token'
      />
    </StoryFrame>
  )
}

export const EnterCode: Story = {
  render: () => <Panel initialStep='code' />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getAllByRole('textbox')[0]!

    await userEvent.type(input, 'a1b2c3d4')
    await expect(submitCode).toHaveBeenCalledWith('A1B2C3D4')
  },
}

export const MultiFactorChallenge: Story = {
  render: () => <Panel initialStep='mfa' />,
}
