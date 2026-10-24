import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { CopyrightStaffCase } from '@/components/copyright/copyright-staff-case'
import {
  clearCopyrightStaffCaseFixture,
  setCopyrightStaffCaseFixture,
} from '@/storybook/mocks/copyright-staff-case-fixture'
import { makeBusyUsStaffCase } from '@/test-helpers/api-responses/copyright-staff-case'

const notice = makeBusyUsStaffCase()

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
    setCopyrightStaffCaseFixture()
    return () => clearCopyrightStaffCaseFixture()
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
