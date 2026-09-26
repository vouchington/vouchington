import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { MemberReportRow } from '@/components/admin/member-report-row'
import { StoryFrame } from '@/storybook/story-frame'
import type { MemberModerationReport } from '@/lib/api/client/reports'

const pendingReport: MemberModerationReport = {
  id: 'report-sapphire-comment',
  case_id: 'case-sapphire-comment',
  created_at: '2026-09-26T04:12:00.000Z',
  reviewed_at: null,
  entity_type: 'comment',
  entity_id: 'post-comment',
  target_label: 'Sapphire Reserve restaurant bonus',
  target_content: {
    kind: 'comment',
    text: 'The referral link paid 80,000 points, but the comment never mentions the $300 travel credit.',
    declared_language: 'en',
    lingua_rs_detected_language: 'en',
  },
  target_path: '/review/post-review/comment/post-comment',
  target_available: true,
  reason: 'spam',
  status: 'pending',
  report_count: 3,
  post_moderation_context: null,
}

const dismissedReport: MemberModerationReport = {
  ...pendingReport,
  id: 'report-open-banking-discussion',
  case_id: 'case-open-banking-discussion',
  entity_type: 'post',
  entity_id: 'post-discussion',
  target_label: 'Best premium card for restaurants?',
  target_content: {
    kind: 'post',
    text: 'Looking for a premium card that earns well at restaurants and still includes a useful travel credit.',
    declared_language: 'en',
    lingua_rs_detected_language: 'en',
  },
  target_path: null,
  reason: 'spam',
  status: 'dismissed',
  report_count: 1,
}

const meta = {
  title: 'Admin/Member Report Row',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function ReportTable({ report }: { report: MemberModerationReport }) {
  return (
    <table className='min-w-full divide-y divide-border'>
      <caption className='sr-only'>Member moderation reports</caption>
      <thead>
        <tr className='text-left text-xs uppercase text-muted-foreground'>
          <th
            scope='col'
            className='px-6 py-3'
          >
            Reported
          </th>
          <th
            scope='col'
            className='px-6 py-3'
          >
            Target
          </th>
          <th
            scope='col'
            className='px-6 py-3'
          >
            Reason
          </th>
          <th
            scope='col'
            className='px-6 py-3'
          >
            Status
          </th>
        </tr>
      </thead>
      <tbody>
        <MemberReportRow report={report} />
      </tbody>
    </table>
  )
}

export const PendingComment: Story = {
  render: () => (
    <StoryFrame>
      <ReportTable report={pendingReport} />
    </StoryFrame>
  ),
}

export const DismissedWithoutLink: Story = {
  render: () => (
    <StoryFrame>
      <ReportTable report={dismissedReport} />
    </StoryFrame>
  ),
}
