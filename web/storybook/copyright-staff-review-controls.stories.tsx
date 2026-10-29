import { expect, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CopyrightStaffAppealReview } from '@/components/copyright/copyright-staff-case-appeal'
import { CopyrightStaffLegalHoldReview } from '@/components/copyright/copyright-staff-case-legal-hold'
import { ReviewButtons } from '@/components/copyright/copyright-staff-review-buttons'
import { makeBusyUsStaffCase } from '@/test-helpers/api-responses/copyright-staff-case'

const notice = makeBusyUsStaffCase()
export default { title: 'Copyright/Staff Review Controls' } satisfies Meta
export const Appeal: StoryObj = {
  render: () => (
    <>
      {notice.appeals.map(appeal => (
        <CopyrightStaffAppealReview
          key={appeal.submission_id}
          appeal={appeal}
          restrictions={notice.restrictions}
          pending={false}
          canSubmit
          rationale='Reviewed the appeal evidence.'
          submit={() => undefined}
        />
      ))}
    </>
  ),
}
export const LegalHold: StoryObj = {
  render: () => (
    <>
      {notice.legal_holds.map(hold => (
        <CopyrightStaffLegalHoldReview
          key={hold.submission_id}
          hold={hold}
          targets={notice.targets}
          pending={false}
          rationale='Reviewed the court filing.'
          submit={() => undefined}
        />
      ))}
    </>
  ),
}
export const Decision: StoryObj = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Approve intake' }),
    ).toBeEnabled()
  },
  render: () => (
    <ReviewButtons
      pending={false}
      canSubmit
      submit={() => undefined}
      approve={async () => undefined}
      reject={async () => undefined}
      heading='Decision'
      description='Record the reviewed outcome.'
      approveLabel='Approve intake'
      rejectLabel='Reject intake'
    />
  ),
}
