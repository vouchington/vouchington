import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CopyrightNoticeStatements } from '@/components/copyright/copyright-notice-statements'

const meta = {
  title: 'Copyright/Statements of Reasons',
  component: CopyrightNoticeStatements,
} satisfies Meta<typeof CopyrightNoticeStatements>
export default meta
type Story = StoryObj<typeof meta>

export const Poster: Story = {
  args: {
    statements: [
      {
        id: 'poster-statement',
        delivery_kind: 'poster_restriction_notice',
        state: 'sent',
        sent_at: '2026-10-01T12:00:00Z',
        text: 'The image is withheld from visibility globally. It has not been deleted. A person made this decision. Legal ground: copyright infringement under 17 U.S.C. 512. Appeal and counter-notice routes are on the case page.',
      },
    ],
  },
}
export const Notifier: Story = {
  args: {
    statements: [
      {
        id: 'notifier-statement',
        delivery_kind: 'claimant_decision_notice',
        state: 'pending',
        sent_at: null,
        text: 'A person confirmed the image restriction. You may contact the designated agent or seek judicial redress through a court.',
      },
    ],
  },
}

export const Failed: Story = {
  args: {
    statements: [
      {
        id: 'failed-statement',
        delivery_kind: 'claimant_decision_notice',
        state: 'failed',
        sent_at: null,
        text: 'A person rejected the notice. You may contact the designated agent.',
      },
    ],
  },
}
export const Bounced: Story = {
  args: {
    statements: [
      {
        id: 'bounced-statement',
        delivery_kind: 'claimant_decision_notice',
        state: 'bounced',
        sent_at: '2026-10-01T12:00:00Z',
        text: 'A person rejected the notice. You may contact the designated agent.',
      },
    ],
  },
}
