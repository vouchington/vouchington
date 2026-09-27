import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CopyrightNoticeForm } from '@/components/copyright/copyright-notice-form'
import { storyCurrentUser } from './entities/entity-fixtures'

const meta = {
  title: 'Copyright/Notice Form',
  component: CopyrightNoticeForm,
  parameters: { auth: { currentUser: storyCurrentUser } },
} satisfies Meta<typeof CopyrightNoticeForm>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
