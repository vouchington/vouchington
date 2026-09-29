import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CopyrightMisrepresentationWarning } from '@/components/copyright/copyright-misrepresentation-warning'

const meta = {
  title: 'Copyright/Misrepresentation Warning',
  component: CopyrightMisrepresentationWarning,
  args: { kind: 'notice' },
} satisfies Meta<typeof CopyrightMisrepresentationWarning>

export default meta
type Story = StoryObj<typeof meta>

export const Notice: Story = {}

export const CounterNotice: Story = { args: { kind: 'counter_notice' } }
