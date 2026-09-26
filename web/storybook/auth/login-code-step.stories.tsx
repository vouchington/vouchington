import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { LoginCodeStep } from '@/components/auth/login-code-step'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Auth/Login Code Step',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function CodeStep({ initialCode, loading }: { initialCode: string; loading: boolean }) {
  const [code, setCode] = useState(initialCode)
  return (
    <StoryFrame width='max-w-sm'>
      <h1 className='mb-4 text-2xl font-bold'>Check your email</h1>
      <LoginCodeStep
        active
        code={code}
        email='cardholder@voucha.example'
        loading={loading}
        onBack={() => {}}
        onCodeChange={setCode}
        onResendCode={async () => {}}
        onSubmit={async event => {
          event.preventDefault()
        }}
        turnstileReady
      />
    </StoryFrame>
  )
}

export const Ready: Story = {
  render: () => (
    <CodeStep
      initialCode='A1B2C3D4'
      loading={false}
    />
  ),
}

export const Verifying: Story = {
  render: () => (
    <CodeStep
      initialCode='A1B2C3D4'
      loading
    />
  ),
}
