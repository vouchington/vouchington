import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import {
  IntegrityFlagsHeader,
  type IntegrityFlagsHeaderLabels,
} from '@/components/admin/integrity-flags-header'

const meta = {
  title: 'Design System/Components/Admin Integrity Flags',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const onRefresh = fn()
const onStatusChange = fn()

const reportLabels = {
  all: 'All',
  description: 'Review and resolve suspected mass report abuse',
  flags: 'Flags',
  penalties: 'Penalties',
  pending: 'Pending',
  refresh: 'Refresh flags',
  resolved: 'Resolved',
  status: 'Filter flags by status',
  title: 'Report Integrity Flags',
} satisfies IntegrityFlagsHeaderLabels

const voteLabels = {
  ...reportLabels,
  description: 'Review and resolve suspicious voting patterns',
  title: 'Vote Integrity Flags',
} satisfies IntegrityFlagsHeaderLabels

export const Report: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <IntegrityFlagsHeader
        flagsHref='/report-integrity/flags'
        headingPw='report-integrity-flags-heading'
        isPending={false}
        labels={reportLabels}
        onRefresh={onRefresh}
        onStatusChange={onStatusChange}
        penaltiesHref='/report-integrity/penalties'
        penaltiesPw='report-integrity-penalties-tab'
        selectedStatus='pending'
      />
    </main>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.getByRole('heading', { name: 'Report Integrity Flags' })).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Penalties' })).toHaveAttribute(
      'href',
      '/report-integrity/penalties',
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Refresh flags' }))
    await expect(onRefresh).toHaveBeenCalled()
  },
}

export const Vote: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <IntegrityFlagsHeader
        flagsHref='/vote-integrity/flags'
        headingPw='vote-integrity-flags-heading'
        isPending={false}
        labels={voteLabels}
        onRefresh={onRefresh}
        onStatusChange={onStatusChange}
        penaltiesHref='/vote-integrity/penalties'
        penaltiesPw='vote-integrity-penalties-tab'
        selectedStatus='pending'
        statusFilterPw='vote-integrity-flags-status-filter'
      />
    </main>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.getByRole('heading', { name: 'Vote Integrity Flags' })).toBeVisible()
    await expect(canvas.getByRole('combobox', { name: 'Filter flags by status' })).toBeVisible()
  },
}
