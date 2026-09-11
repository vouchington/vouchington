import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FoundationsShowcase } from './foundations-showcase'

const meta = {
  title: 'Design System/Foundations',
  component: FoundationsShowcase,
} satisfies Meta<typeof FoundationsShowcase>

export default meta
type Story = StoryObj<typeof meta>

export const Overview: Story = {}
