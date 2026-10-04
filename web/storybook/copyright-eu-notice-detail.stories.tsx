import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CopyrightEuNoticeDetail } from '@/components/copyright/copyright-eu-notice-detail'
import { makeCopyrightEuParticipantNotice } from '@/test-helpers/api-responses/copyright-eu'

const meta = {
  title: 'Copyright/EU Notice Detail',
  component: CopyrightEuNoticeDetail,
  args: { notice: makeCopyrightEuParticipantNotice() },
} satisfies Meta<typeof CopyrightEuNoticeDetail>
export default meta
type Story = StoryObj<typeof meta>
export const NoAction: Story = {}
export const AwaitingDecision: Story = {
  args: {
    notice: makeCopyrightEuParticipantNotice({ outcome: null, decided_at: null, canSubmit: false }),
  },
}
export const Reopened: Story = {
  args: {
    notice: makeCopyrightEuParticipantNotice({
      reopenedAt: '2026-10-04T12:00:00Z',
      canSubmit: false,
    }),
  },
}
