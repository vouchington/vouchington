import { expect, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  CopyrightStaffComplaint,
  CopyrightStaffCorrespondence,
  CopyrightStaffCounterNotices,
} from '@/components/copyright/copyright-staff-case-detail'
import { CopyrightStaffIntentRecovery } from '@/components/copyright/copyright-staff-intent-recovery'
import { makeBusyUsStaffCase } from '@/test-helpers/api-responses/copyright-staff-case'

const notice = makeBusyUsStaffCase()
export default { title: 'Copyright/Staff Case Details' } satisfies Meta
export const Complaint: StoryObj = { render: () => <CopyrightStaffComplaint notice={notice} /> }
export const Correspondence: StoryObj = {
  render: () => <CopyrightStaffCorrespondence notice={notice} />,
}
export const CounterNotice: StoryObj = {
  render: () => (
    <CopyrightStaffCounterNotices
      notice={notice}
      pending={false}
      canSubmit
      rationale='The statutory fields are complete.'
      submit={() => undefined}
    />
  ),
}
export const FailedDelivery: StoryObj = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getAllByRole('button', { name: 'Retry' }).length,
    ).toBeGreaterThan(0)
  },
  render: () => (
    <CopyrightStaffIntentRecovery
      notice={notice}
      pending={false}
      submitRecovery={() => undefined}
    />
  ),
}
