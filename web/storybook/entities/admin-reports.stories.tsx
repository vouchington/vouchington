import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { AdminReportRow } from '@/components/admin/admin-report-row'
import { ReportClusterCard } from '@/components/admin/report-cluster-card'
import { ReportDetail } from '@/components/admin/report-cluster-detail'
import { ReportBanEvasionActions } from '@/components/admin/report-ban-evasion-actions'
import { DuplicateClusterCard } from '@/components/admin/report-duplicate-cluster-card'
import { ReportRowWarnButton } from '@/components/admin/report-row-warn-button'
import { ClusteredReportsClient } from '@/components/admin/reports-clustered-client'
import { ReportsClient } from '@/components/admin/reports-client'
import { banEvasionReport, clusteredData, data, report } from './admin-reports.fixtures'
import { EntityStoryFrame } from './entity-story-frame'

const meta = {
  title: 'Entities/Admin/Reports',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const PendingReports: Story = {
  render: () => (
    <EntityStoryFrame
      title='Admin Reports'
      description='Pending moderation reports with status actions.'
    >
      <ReportsClient
        viewerTier='staff'
        data={data}
      />
    </EntityStoryFrame>
  ),
}

export const ClusteredReports: Story = {
  render: () => (
    <EntityStoryFrame
      title='Admin Report Clusters'
      description='Staff report queue grouped by target with duplicate indicators.'
    >
      <ClusteredReportsClient
        canBulkRemove
        data={{
          ...clusteredData,
          duplicate_clusters: [
            {
              ...clusteredData.duplicate_clusters[0]!,
              clusters: clusteredData.results,
            },
          ],
        }}
      />
    </EntityStoryFrame>
  ),
}

export const ClusterCard: Story = {
  render: () => (
    <EntityStoryFrame
      title='Admin Report Cluster Card'
      description='A grouped moderation target with nested reports.'
    >
      <ReportClusterCard
        active
        canRemove
        cluster={clusteredData.results[0]!}
        disabled={false}
        loadingAction={null}
        onActiveChange={fn()}
        onDismiss={fn()}
        onRemoveTarget={fn()}
        onReview={fn()}
        onRerun={fn()}
        onWarn={fn()}
        onBanEvasionAction={fn()}
        rerunningReportId={null}
        uiLocale='en-US'
      />
    </EntityStoryFrame>
  ),
}

export const DuplicateCluster: Story = {
  render: () => (
    <EntityStoryFrame
      title='Duplicate Report Cluster'
      description='Cross-post duplicate moderation cluster.'
    >
      <DuplicateClusterCard
        canRemove
        disabled={false}
        duplicate={{
          ...clusteredData.duplicate_clusters[0]!,
          clusters: clusteredData.results,
        }}
        loading={false}
        onRemove={fn()}
        uiLocale='en-US'
      />
    </EntityStoryFrame>
  ),
}

export const ClusterReportDetail: Story = {
  render: () => (
    <EntityStoryFrame
      title='Cluster Report Detail'
      description='Nested report details inside a clustered queue item.'
    >
      <ReportDetail
        disabled={false}
        onRerun={fn()}
        onWarn={fn()}
        report={report}
        rerunning={false}
      />
    </EntityStoryFrame>
  ),
}

export const Row: Story = {
  render: () => (
    <EntityStoryFrame
      title='Admin Report Row'
      description='A single pending report row.'
    >
      <table className='min-w-full divide-y divide-border'>
        <tbody className='divide-y divide-border bg-card'>
          <AdminReportRow
            active
            disabled={false}
            onActiveChange={fn()}
            onResolve={fn()}
            onRerun={fn()}
            onSelectionToggle={fn()}
            report={report}
            selected={false}
          />
        </tbody>
      </table>
    </EntityStoryFrame>
  ),
}

export const BanEvasionRow: Story = {
  render: () => (
    <EntityStoryFrame
      title='Ban Evasion Report Row'
      description='A system-generated ban-evasion report row with confirm and dismiss actions.'
    >
      <table className='min-w-full divide-y divide-border'>
        <tbody className='divide-y divide-border bg-card'>
          <AdminReportRow
            active
            disabled={false}
            onActiveChange={fn()}
            onResolve={fn()}
            onRerun={fn()}
            onBanEvasionAction={fn()}
            onSelectionToggle={fn()}
            report={banEvasionReport}
            selected={false}
          />
        </tbody>
      </table>
    </EntityStoryFrame>
  ),
}

export const BanEvasionActions: Story = {
  render: () => (
    <EntityStoryFrame
      title='Ban Evasion Actions'
      description='Confirm or dismiss a pending ban-evasion report.'
    >
      <div className='flex flex-wrap gap-2'>
        <ReportBanEvasionActions
          disabled={false}
          onAction={fn()}
          report={banEvasionReport}
        />
      </div>
    </EntityStoryFrame>
  ),
}

export const WarnButton: Story = {
  render: () => (
    <EntityStoryFrame
      title='Report Row Warn Button'
      description='Warn button rendered in a report action context.'
    >
      <ReportRowWarnButton
        userId='user-1'
        reportId='report-1'
      />
    </EntityStoryFrame>
  ),
}
