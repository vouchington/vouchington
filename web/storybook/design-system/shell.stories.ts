import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ShellShowcase } from './shell-showcase'

const meta = {
  title: 'Design System/Shell',
  component: ShellShowcase,
} satisfies Meta<typeof ShellShowcase>

export default meta
type Story = StoryObj<typeof meta>

export const WithAside: Story = {}

export const MobileWithAside: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
}
