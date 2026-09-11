import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import Link from 'next/link'
// Story-local type mirror — avoids importing the server-only reports module in browser mode.
interface ModerationReport {
  id: string
  created_at: string
  created_label: string
  reviewed_at: string | null
  reporter_user_id: string
  reporter_username?: string | null
  entity_type: 'rss_feed_item' | 'post' | 'comment' | 'user'
  entity_id: string
  target_path: string | null
  reason: string
  note: string | null
  status: 'pending' | 'reviewed' | 'actioned' | 'dismissed'
}

const meta = {
  title: 'Design System/Components/Admin Reports',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const reports: ModerationReport[] = [
  {
    id: 'report-1',
    created_at: '2026-05-24T10:00:00.000Z',
    created_label: '2026-05-24',
    reviewed_at: null,
    reporter_user_id: 'user-alex',
    reporter_username: 'alex',
    entity_type: 'post',
    entity_id: 'post-discussion',
    target_path: '/posts/fixture-discussion',
    reason: 'spam',
    note: null,
    status: 'pending',
  },
  {
    id: 'report-2',
    created_at: '2026-05-23T08:45:00.000Z',
    created_label: '2026-05-23',
    reviewed_at: null,
    reporter_user_id: 'user-anon-abc123',
    reporter_username: null,
    entity_type: 'comment',
    entity_id: 'comment-xyz-789',
    target_path: null,
    reason: 'harassment',
    note: 'Repeated targeting of the same user across multiple threads.',
    status: 'pending',
  },
  {
    id: 'report-3',
    created_at: '2026-05-22T16:20:00.000Z',
    created_label: '2026-05-22',
    reviewed_at: null,
    reporter_user_id: 'user-agent',
    reporter_username: 'voucha-agent',
    entity_type: 'rss_feed_item',
    entity_id: 'rss-item-001',
    target_path: null,
    reason: 'misinformation',
    note: null,
    status: 'pending',
  },
]

function ReportsTable({ data }: { data: ModerationReport[] }) {
  if (data.length === 0) {
    return (
      <p
        className='text-muted-foreground'
        data-pw='admin-reports-empty'
      >
        No pending reports.
      </p>
    )
  }
  return (
    <div className='overflow-x-auto'>
      <table
        className='w-full text-sm'
        data-pw='admin-reports-table'
      >
        <thead>
          <tr className='border-b text-left'>
            <th className='py-2 pr-4 font-semibold'>Created</th>
            <th className='py-2 pr-4 font-semibold'>Reporter</th>
            <th className='py-2 pr-4 font-semibold'>Entity type</th>
            <th className='py-2 pr-4 font-semibold'>Entity ID</th>
            <th className='py-2 pr-4 font-semibold'>Reason</th>
            <th className='py-2 font-semibold'>Note</th>
          </tr>
        </thead>
        <tbody>
          {data.map(report => (
            <tr
              key={report.id}
              className='border-b last:border-0'
              data-pw='admin-reports-row'
            >
              <td className='py-2 pr-4 tabular-nums'>
                <time dateTime={report.created_at}>{report.created_label}</time>
              </td>
              <td className='py-2 pr-4'>
                {report.reporter_username ? (
                  <Link
                    href={`/user/${report.reporter_username}`}
                    className='underline'
                    prefetch={false}
                  >
                    {report.reporter_username}
                  </Link>
                ) : (
                  <span className='font-mono text-xs'>{report.reporter_user_id}</span>
                )}
              </td>
              <td className='py-2 pr-4'>{report.entity_type}</td>
              <td className='py-2 pr-4 font-mono text-xs'>
                {report.target_path ? (
                  <Link
                    href={report.target_path}
                    className='underline'
                    prefetch={false}
                  >
                    {report.entity_id}
                  </Link>
                ) : (
                  report.entity_id
                )}
              </td>
              <td
                className='py-2 pr-4'
                data-pw='admin-reports-reason'
              >
                {report.reason}
              </td>
              <td className='max-w-sm whitespace-pre-wrap break-words py-2'>
                {report.note ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const WithReports: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-4xl'>
        <Breadcrumbs
          items={[
            { name: 'Admin', path: '/admin' },
            { name: 'Reports', path: '/reports' },
          ]}
        />
        <div className='mt-4'>
          <h1
            className='mb-4 text-xl font-semibold'
            data-pw='admin-reports-heading'
          >
            Pending Moderation Reports
          </h1>
          <ReportsTable data={reports} />
        </div>
      </div>
    </main>
  ),
}

export const Empty: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-4xl'>
        <Breadcrumbs
          items={[
            { name: 'Admin', path: '/admin' },
            { name: 'Reports', path: '/reports' },
          ]}
        />
        <div className='mt-4'>
          <h1
            className='mb-4 text-xl font-semibold'
            data-pw='admin-reports-heading'
          >
            Pending Moderation Reports
          </h1>
          <ReportsTable data={[]} />
        </div>
      </div>
    </main>
  ),
}
