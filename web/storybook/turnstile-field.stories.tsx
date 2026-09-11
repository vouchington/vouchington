import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TurnstileField } from '@/components/shared/turnstile-field'

const noopRef = () => {}

const meta = {
  title: 'Design System/Components/Turnstile Field',
  component: TurnstileField,
  parameters: { auth: { currentUser: null } },
} satisfies Meta<typeof TurnstileField>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    turnstile: { containerRef: noopRef, isError: false },
  },
}

export const ScriptLoadError: Story = {
  args: {
    turnstile: { containerRef: noopRef, isError: true },
  },
}
