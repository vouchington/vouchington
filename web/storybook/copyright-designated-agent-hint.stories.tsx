import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  CopyrightDesignatedAgentHint,
  CopyrightTargetNotFound,
} from '@/components/copyright/copyright-designated-agent-hint'

const meta = {
  title: 'Copyright/Designated Agent Hint',
  component: CopyrightDesignatedAgentHint,
} satisfies Meta<typeof CopyrightDesignatedAgentHint>

export default meta
type Story = StoryObj<typeof meta>

export const Hint: Story = {}

export const TargetNotFound: Story = { render: () => <CopyrightTargetNotFound /> }
