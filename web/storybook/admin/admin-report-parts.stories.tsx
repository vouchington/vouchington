import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { AdminReportRowActions } from '@/components/admin/admin-report-row-actions'
import { AdminReportTargetCell } from '@/components/admin/admin-report-target-cell'
import { report } from '@/storybook/entities/admin-reports.fixtures'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Admin/Admin Report Parts',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const idle = fn()

export const PendingRow: Story = {
  render: () => (
    <StoryFrame>
      <table className='min-w-full'>
        <tbody>
          <tr>
            <AdminReportTargetCell
              report={report}
              targetLabel={report.target_label}
              targetLabelFor={label => label}
            />
            <AdminReportRowActions
              disabled={false}
              onResolve={idle}
              onRerun={idle}
              report={report}
              targetLabel={report.target_label}
            />
          </tr>
        </tbody>
      </table>
    </StoryFrame>
  ),
}
