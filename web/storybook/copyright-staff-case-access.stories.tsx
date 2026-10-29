import { expect, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CopyrightStaffGuestCapability } from '@/components/copyright/copyright-staff-guest-capability'
import { CopyrightGuestCapabilityRows } from '@/components/copyright/copyright-staff-guest-capability-rows'
import { CopyrightRepeatInfringerActions } from '@/components/copyright/copyright-repeat-infringer-actions'
import { CopyrightStaffStaydownMatches } from '@/components/copyright/copyright-staff-staydown-matches'
import {
  clearCopyrightStaffCaseFixture,
  setCopyrightStaffCaseFixture,
} from '@/storybook/mocks/copyright-staff-case-fixture'
import { makeBusyUsStaffCase } from '@/test-helpers/api-responses/copyright-staff-case'

const notice = makeBusyUsStaffCase()
export default {
  title: 'Copyright/Staff Case Access',
  beforeEach() {
    setCopyrightStaffCaseFixture()
    return () => clearCopyrightStaffCaseFixture()
  },
} satisfies Meta
export const IssueGuestAccess: StoryObj = {
  render: () => <CopyrightStaffGuestCapability noticeId={notice.id} />,
}
export const GuestAccessLoadFailed: StoryObj = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Retry' })).toBeEnabled()
  },
  render: () => (
    <CopyrightGuestCapabilityRows
      list={{
        rows: [],
        status: 'failed',
        endCursor: null,
        hasNextPage: false,
        reload: () => undefined,
        loadOlder: async () => undefined,
      }}
      pending={false}
      onRequest={() => undefined}
      onRevoke={() => undefined}
      onLoadOlder={() => undefined}
    />
  ),
}
export const RepeatInfringerRecord: StoryObj = {
  render: () => (
    <CopyrightRepeatInfringerActions
      noticeId={notice.id}
      canAdminister
      pending={false}
      canSubmit
      rationale='Reviewed the account history.'
      submit={() => undefined}
    />
  ),
}
export const PossibleReuploads: StoryObj = {
  render: () => (
    <CopyrightStaffStaydownMatches
      notice={notice}
      pending={false}
      submitRecovery={() => undefined}
    />
  ),
}
