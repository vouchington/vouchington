import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { IssueWarningDialog } from '@/components/shared/issue-warning-dialog'

const meta = {
  title: 'Shared/IssueWarningDialog',
  component: IssueWarningDialog,
  parameters: { auth: { currentUser: null } },
} satisfies Meta<typeof IssueWarningDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    userId: 'user-1',
  },
}

export const WithReport: Story = {
  args: {
    userId: 'user-1',
    reportId: 'report-1',
  },
}
