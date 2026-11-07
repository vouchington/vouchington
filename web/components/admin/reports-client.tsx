'use client'

import type {
  ModerationReportSortParam,
  StaffFlatModerationReportsResponse,
} from '@/lib/api/client/reports'
import { FlatReportsClient } from './flat-reports-client'
import { ClusteredReportsClient } from './reports-clustered-client'

export type {
  AdminModerationReport,
  AdminClusteredModerationReportsResponse,
} from './reports-client-types'
import type {
  AdminClusteredModerationReportsResponse,
  MemberModerationReportsResponse,
} from './reports-client-types'

type ReportsClientProps = (
  | {
      viewerTier: 'staff'
      data: StaffFlatModerationReportsResponse | AdminClusteredModerationReportsResponse
      canBulkRemove?: boolean
    }
  | { viewerTier: 'member'; data: MemberModerationReportsResponse }
) & {
  /** Active URL state, forwarded to pagination links so navigation preserves it. */
  statusFilter?: string
  sortOrder?: ModerationReportSortParam
  currentAfter?: string
  clusterMode?: 'entity' | 'none'
}

export function ReportsClient(props: ReportsClientProps) {
  const { viewerTier, data, statusFilter, sortOrder, currentAfter, clusterMode } = props
  if (viewerTier === 'staff') {
    const canBulkRemove = props.canBulkRemove ?? true
    if (isClusteredReportsResponse(data)) {
      return (
        <ClusteredReportsClient
          data={data}
          canBulkRemove={canBulkRemove}
          statusFilter={statusFilter}
          sortOrder={sortOrder}
          currentAfter={currentAfter}
        />
      )
    }
    return (
      <FlatReportsClient
        viewerTier='staff'
        data={data}
        canBulkRemove={canBulkRemove}
        statusFilter={statusFilter}
        sortOrder={sortOrder}
        currentAfter={currentAfter}
        clusterMode={clusterMode}
      />
    )
  }
  return (
    <FlatReportsClient
      viewerTier='member'
      data={data}
      canBulkRemove={false}
      statusFilter={statusFilter}
      sortOrder={sortOrder}
      currentAfter={currentAfter}
      clusterMode={clusterMode}
    />
  )
}

function isClusteredReportsResponse(
  data: StaffFlatModerationReportsResponse | AdminClusteredModerationReportsResponse,
): data is AdminClusteredModerationReportsResponse {
  return 'cluster_mode' in data
}
