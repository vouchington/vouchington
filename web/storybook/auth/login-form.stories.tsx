import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { LoginForm } from '@/components/auth/login-form'
import { RuntimePublicConfigProvider } from '@/lib/runtime-public-config-provider'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Auth/Login Form',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function Form({ initialEmailAddress }: { initialEmailAddress?: string }) {
  return (
    <StoryFrame width='max-w-sm'>
      <RuntimePublicConfigProvider config={{}}>
        <LoginForm
          initialEmailAddress={initialEmailAddress}
          onLoginSuccess={() => {}}
        />
      </RuntimePublicConfigProvider>
    </StoryFrame>
  )
}

export const EmailStep: Story = {
  render: () => <Form />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('textbox')).toBeVisible()
  },
}

export const PrefilledEmail: Story = {
  render: () => <Form initialEmailAddress='cardholder@voucha.example' />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByDisplayValue('cardholder@voucha.example')).toBeVisible()
  },
}
