import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, spyOn, userEvent, within } from 'storybook/test'
import { CopyrightStaffCase } from '@/components/copyright/copyright-staff-case'
import { ClientRequest } from '@/lib/api/client/request'
import { makeBusyUsStaffCase } from '@/test-helpers/api-responses/copyright-staff-case'

const notice = makeBusyUsStaffCase()

const guestCapabilities = {
  copyright_guest_capabilities: [
    {
      id: 'capability-active',
      issued_at: '2026-10-01T00:00:00Z',
      issued_by_id: 'staff-1',
      issued_by_username: 'reviewer',
      expires_at: '2099-01-01T00:00:00Z',
      revoked_at: null,
    },
    {
      id: 'capability-revoked',
      issued_at: '2026-09-01T00:00:00Z',
      issued_by_id: 'staff-1',
      issued_by_username: 'reviewer',
      expires_at: '2099-01-01T00:00:00Z',
      revoked_at: '2026-09-02T00:00:00Z',
    },
  ],
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
}

const repeatInfringerAccounts = {
  copyright_repeat_infringer_accounts: [
    {
      account_user_id: 'user-uploader',
      incident_id: 'incident-1',
      is_operative: true,
      open_review_id: 'review-1',
      termination_in_effect: true,
    },
  ],
}

const meta = {
  title: 'Copyright/Staff Case',
  component: CopyrightStaffCase,
  args: {
    notice,
    canAdminister: true,
    pending: false,
    rationale: 'Reviewed against the filed evidence.',
    submit: () => undefined,
    submitRecovery: () => undefined,
  },
  beforeEach() {
    spyOn(ClientRequest.prototype, 'get').mockImplementation((endpoint: string) => {
      if (endpoint.endsWith('/guest-capabilities')) return Promise.resolve(guestCapabilities)
      if (endpoint.endsWith('/repeat-infringer-accounts')) {
        return Promise.resolve(repeatInfringerAccounts)
      }
      return Promise.reject(new Error(`Unexpected story request ${endpoint}`))
    })
  },
} satisfies Meta<typeof CopyrightStaffCase>

export default meta
type Story = StoryObj<typeof meta>

export const BusyUsCase: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Filing awaiting assessment')).toBeVisible()
    await expect(canvas.getByText('Escalation due')).toBeVisible()
    await expect(canvas.getByText(/1 notice withdrawn by the notifier/)).toBeVisible()
    await expect(canvas.getByText(/Set by user-setter; uploaded by user-uploader/)).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Confirm restriction' })).toBeEnabled()
    await expect(canvas.getByRole('button', { name: 'Accept counter-notice' })).toBeEnabled()
    await expect(canvas.getByText('Email correspondence: withdrawal')).toBeVisible()
    await expect(canvas.getByText(/Media withhold failed: Storage timeout/)).toBeVisible()
    await expect(canvas.getByText(/Near-duplicate \(4 of 64 bits differ\)/)).toBeVisible()
    await expect(canvas.getByText('Bounced')).toBeVisible()
    await expect(await canvas.findByRole('list', { name: 'Issued guest access' })).toBeVisible()
  },
}

export const RepeatInfringerRecord: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Show repeat-infringer record' }))
    await expect(await canvas.findByText('Account user-uploader')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Mark withdrawn' })).toBeEnabled()
    await expect(canvas.getByRole('button', { name: 'Terminate account' })).toBeEnabled()
    await expect(canvas.getByRole('button', { name: 'Record reinstatement' })).toBeEnabled()
  },
}
