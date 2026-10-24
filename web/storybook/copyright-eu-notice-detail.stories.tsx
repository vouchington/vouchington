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
export const WithHostedMaterial: Story = {
  args: {
    notice: {
      ...makeCopyrightEuParticipantNotice(),
      target_count: 1,
      targets: [
        {
          id: '019f0000-0000-7000-8000-000000000004',
          hosted_use_url: 'https://voucha.ai/discussion/019f0000-0000-7000-8000-000000000005',
          surface: 'post-image',
          restriction_status: 'active',
        },
      ],
    },
  },
}
