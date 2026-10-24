import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CopyrightNoticeDetailView } from '@/components/copyright/copyright-notice-detail'

const target = {
  id: '019f0000-0000-7000-8000-0000000000b3',
  surface: 'post-image' as const,
  hosted_use_url: 'https://voucha.ai/discussion/019f0000-0000-7000-8000-0000000000b4',
  restriction_status: 'active' as const,
}

const notice = {
  id: '019f0000-0000-7000-8000-0000000000b1',
  jurisdiction: 'us_dmca' as const,
  received_at: '2026-10-01T10:00:00Z',
  accepted_at: '2026-10-02T10:00:00Z',
  provisional_withholding_at: null,
  target_count: 1,
  claimant: {
    user_id: '019f0000-0000-7000-8000-0000000000b2',
    display_name: 'Current claimant',
  },
  targets: [target],
  timeline: [
    { id: 'event-1', event_type: 'notice_received', created_at: '2026-10-02T10:00:00Z' },
    { id: 'event-2', event_type: 'placement_withheld', created_at: '2026-10-03T10:00:00Z' },
  ],
}

const meta = {
  title: 'Copyright/Notice Detail',
  component: CopyrightNoticeDetailView,
  args: { notice, responseEligibility: null },
} satisfies Meta<typeof CopyrightNoticeDetailView>

export default meta
type Story = StoryObj<typeof meta>

export const RestrictedMaterial: Story = {}

export const HiddenMaterial: Story = {
  args: { notice: { ...notice, targets: [{ ...target, hosted_use_url: null }] } },
}
