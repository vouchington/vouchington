import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CopyrightEuDisputeSettlements } from '@/components/copyright/copyright-eu-dispute-settlements'
import {
  makeCopyrightEuDisputeSettlement,
  makeCopyrightEuDisputeSettlementsPage,
} from '@/test-helpers/api-responses/copyright-eu'

const noticeId = '019f0000-0000-7000-8000-000000000001'
const referral = makeCopyrightEuDisputeSettlement()
const meta = {
  title: 'Copyright/EU Dispute Settlements',
  component: CopyrightEuDisputeSettlements,
  args: { noticeId, data: makeCopyrightEuDisputeSettlementsPage() },
} satisfies Meta<typeof CopyrightEuDisputeSettlements>
export default meta
type Story = StoryObj<typeof meta>
export const Empty: Story = {}
export const Recorded: Story = {
  args: { data: makeCopyrightEuDisputeSettlementsPage([referral]) },
}
export const WithOutcome: Story = {
  args: {
    data: makeCopyrightEuDisputeSettlementsPage([
      makeCopyrightEuDisputeSettlement({
        outcome: {
          result: 'decided_for_recipient',
          decided_at: '2026-10-04T12:00:00Z',
          implemented_at: '2026-10-04T14:00:00Z',
        },
      }),
    ]),
  },
}
