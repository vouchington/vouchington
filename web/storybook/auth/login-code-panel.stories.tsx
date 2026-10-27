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

    await userEvent.type(input, 'a2b3c4d5e6')
    const submit = canvas.getByRole('button', { name: 'Log in' })
    await expect(submit).toBeEnabled()
    await userEvent.click(submit)
    await expect(submitCode).toHaveBeenCalledWith('A2B3C4D5E6')
  },
}

export const MultiFactorChallenge: Story = {
  render: () => <Panel initialStep='mfa' />,
}
