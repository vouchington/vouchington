import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ComponentsShowcase } from './components-showcase'

const meta = {
  title: 'Design System/Components',
  component: ComponentsShowcase,
} satisfies Meta<typeof ComponentsShowcase>

export default meta
type Story = StoryObj<typeof meta>

export const Overview: Story = {}
