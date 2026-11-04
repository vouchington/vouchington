import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { CopyrightStaffClaimantMisuse } from '@/components/copyright/copyright-staff-claimant-misuse'
import { makeBusyUsStaffCase } from '@/test-helpers/api-responses/copyright-staff-case'

const meta = {
  title: 'Copyright/Staff Claimant Misuse',
  component: CopyrightStaffClaimantMisuse,
} satisfies Meta<typeof CopyrightStaffClaimantMisuse>

export default meta
type Story = StoryObj<typeof meta>

const summary = makeBusyUsStaffCase().claimant.misuse!

export const OlderNoticesAvailable: Story = {
  args: {
    claimantUserId: 'claimant-1',
    misuse: {
      ...summary,
      notice_count: 1000,
      page_info: { has_next_page: true, start_cursor: 'first', end_cursor: 'next' },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Oldest notice received')).toBeVisible()
    await expect(canvas.getByText('Newest notice received')).toBeVisible()
    const times = canvasElement.querySelectorAll('time')
    await expect(times).toHaveLength(2)
    await expect(times[0]).toHaveAttribute('datetime', summary.oldest_notice_at)
    await expect(times[1]).toHaveAttribute('datetime', summary.newest_notice_at)
    await expect(times[0]).toHaveTextContent('UTC')
  },
}

export const NoAccount: Story = {
  args: { claimantUserId: null, misuse: null },
}

export const NoMisuseInWindow: Story = {
  args: {
    claimantUserId: 'claimant-1',
    misuse: {
      ...summary,
      notice_withdrawn: 0,
      notice_rejected: 0,
      restriction_reversed_by_counter_notice: 0,
      restriction_reversed_by_appeal: 0,
    },
  },
}

export const EmptyWindow: Story = {
  args: {
    claimantUserId: 'claimant-1',
    misuse: {
      ...summary,
      notice_count: 0,
      notice_withdrawn: 0,
      notice_rejected: 0,
      restriction_reversed_by_counter_notice: 0,
      restriction_reversed_by_appeal: 0,
      oldest_notice_at: null,
      newest_notice_at: null,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('0 notices inspected')).toBeVisible()
    await expect(canvasElement.querySelector('time')).toBeNull()
  },
}
