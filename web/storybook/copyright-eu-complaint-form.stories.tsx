import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CopyrightEuComplaintForm } from '@/components/copyright/copyright-eu-complaint-form'
import { storyCurrentUser } from './entities/entity-fixtures'

const meta = {
  title: 'Copyright/EU Complaint Form',
  component: CopyrightEuComplaintForm,
  parameters: { auth: { currentUser: storyCurrentUser } },
  args: { noticeId: '019f0000-0000-7000-8000-000000000001' },
} satisfies Meta<typeof CopyrightEuComplaintForm>

export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
