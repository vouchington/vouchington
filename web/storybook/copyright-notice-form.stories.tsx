import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CopyrightNoticeForm } from '@/components/copyright/copyright-notice-form'

const meta = {
  title: 'Copyright/Notice Form',
  component: CopyrightNoticeForm,
  parameters: { auth: { currentUser: null } },
} satisfies Meta<typeof CopyrightNoticeForm>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
