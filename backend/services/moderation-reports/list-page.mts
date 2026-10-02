import type { ModerationReportSort } from './sort-sql.mts'
import { listRedactedModerationReports } from './redaction.mts'
import assert from 'http-assert'
import { listModerationReports } from './get.mts'
import { listClusteredModerationReports } from './clustered.mts'
import { buildReportPageInfo } from './pagination.mts'
import { withoutClusterCursorMetadata, withoutCursorMetadata } from './public-shape.mts'
import { parseReportCursor, reportCursorScope } from './cursor.mts'
import type { ModerationReportStatus } from './config.mts'

export type ReportPageOptions = {
  limit?: number
  after?: string
  before?: string
  status?: ModerationReportStatus
  sort?: ModerationReportSort
  cluster?: 'entity'
}

type StaffReport = Awaited<ReturnType<typeof listModerationReports>>['reports'][number]
type MemberReport = Awaited<ReturnType<typeof listRedactedModerationReports>>['reports'][number]
type FlatPage<T extends object> = {
  results: Omit<T, Extract<keyof T, `cursor_${string}`>>[]
  page_info: ReturnType<typeof buildReportPageInfo>
}
type RawClusterPage = Awaited<ReturnType<typeof listClusteredModerationReports>>
type PublicCluster = ReturnType<typeof withoutClusterCursorMetadata>
type ClusterPage = Omit<RawClusterPage, 'results' | 'duplicate_clusters'> & {
  results: PublicCluster[]
  duplicate_clusters: Array<
    Omit<RawClusterPage['duplicate_clusters'][number], 'clusters'> & { clusters: PublicCluster[] }
  >
}
export function listModerationReportPage(
  audience: 'staff',
  ownerId: null,
  args: ReportPageOptions & { cluster: 'entity' },
): Promise<ClusterPage>
export function listModerationReportPage(
  audience: 'staff',
  ownerId: null,
  args: ReportPageOptions & { cluster?: undefined },
): Promise<FlatPage<StaffReport>>
export function listModerationReportPage(
  audience: 'member',
  ownerId: string,
  args: ReportPageOptions & { cluster?: undefined },
): Promise<FlatPage<MemberReport>>
export function listModerationReportPage(
  audience: 'staff' | 'member',
  ownerId: string | null,
  args: ReportPageOptions,
): Promise<ClusterPage | FlatPage<StaffReport> | FlatPage<MemberReport>>
export async function listModerationReportPage(
  audience: 'staff' | 'member',
  ownerId: string | null,
  args: ReportPageOptions,
) {
  assert(!(args.after && args.before), 422, 'after and before cannot be combined')
  const status = args.status ?? 'pending'
  const sort = args.cluster
    ? args.sort === 'created_at_asc'
      ? args.sort
      : 'created_at_desc'
    : (args.sort ?? (audience === 'staff' ? 'severity' : 'created_at_desc'))
  const cursor = args.after || args.before ? parseReportCursor((args.after ?? args.before)!) : null
  const cursorScope = reportCursorScope(audience, ownerId)
  assert(
    !cursor || (cursor.scope === cursorScope && cursor.sort === sort && cursor.status === status),
    422,
    'Invalid cursor',
  )
  const options = {
    limit: args.limit ?? 25,
    status,
    sort,
    beforeCursor: cursor,
    cursorDirection: args.before ? ('before' as const) : ('after' as const),
  }
  if (args.cluster) {
    assert(audience === 'staff', 403, 'Forbidden')
    assert(!cursor || cursor.cluster, 422, 'Invalid cursor')
    const response = await listClusteredModerationReports({
      ...options,
      beforeCursor: cursor?.cluster ? cursor : null,
      cursorScope,
    })
    return {
      ...response,
      results: response.results.map(withoutClusterCursorMetadata),
      duplicate_clusters: response.duplicate_clusters.map(duplicate => ({
        ...duplicate,
        clusters: duplicate.clusters.map(withoutClusterCursorMetadata),
      })),
    }
  }
  assert(!cursor || !cursor.cluster, 422, 'Invalid cursor')
  const { reports, hasNextPage, hasPreviousPage } = await (audience === 'staff'
    ? listModerationReports(options)
    : listRedactedModerationReports(options))
  return {
    results: reports.map(withoutCursorMetadata),
    page_info: buildReportPageInfo(reports, hasNextPage, hasPreviousPage, {
      sort,
      status,
      scope: cursorScope,
    }),
  }
}
