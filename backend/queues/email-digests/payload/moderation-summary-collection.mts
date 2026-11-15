import { JobPayloadError } from '@queues/emails/payload/job-payload-error'
import { asRecord, assertExactKeys, requiredString } from '@queues/emails/payload/job-payload-read'
import { MODERATION_SUMMARY_METRIC_KEYS } from '@queues/background/enqueues/moderation-summary-state'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab0-9][0-9a-f]{3}-[0-9a-f]{12}$/i
function identifier(record: Record<string, unknown>, key: string): void {
  requiredString(record, key)
  if (!UUID.test(String(record[key]))) throw new JobPayloadError(`${key} must be a UUID`)
}
function integer(record: Record<string, unknown>, key: string, max: number): void {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max)
    throw new JobPayloadError(`${key} must be a bounded nonnegative integer`)
}
function metrics(value: unknown): void {
  const record = asRecord(value, 'metrics')
  assertExactKeys(record, [...MODERATION_SUMMARY_METRIC_KEYS])
  for (const key of MODERATION_SUMMARY_METRIC_KEYS) integer(record, key, 100)
}
function bestDiscussion(value: unknown): void {
  if (value === null) return
  const record = asRecord(value, 'best discussion')
  assertExactKeys(record, ['id', 'replies'])
  identifier(record, 'id')
  integer(record, 'replies', 100)
}
function scan(value: unknown): void {
  if (value === null) return
  const record = asRecord(value, 'community scan')
  assertExactKeys(record, [
    'communityId',
    'stage',
    'afterId',
    'parentId',
    'afterChildId',
    'sourceUpperId',
    'childUpperId',
    'childCount',
    'metrics',
    'bestDiscussion',
  ])
  identifier(record, 'communityId')
  identifier(record, 'afterId')
  identifier(record, 'afterChildId')
  if (record.sourceUpperId !== null) identifier(record, 'sourceUpperId')
  if (record.childUpperId !== null) identifier(record, 'childUpperId')
  if (record.parentId !== null) identifier(record, 'parentId')
  if (
    ![
      'reviews',
      'applications',
      'report-posts',
      'reports',
      'evaders',
      'members',
      'activity-posts',
      'replies',
      'complete',
    ].includes(String(record.stage))
  )
    throw new JobPayloadError('Invalid community scan stage')
  if (['reports', 'replies'].includes(String(record.stage)) && record.parentId === null)
    throw new JobPayloadError('Child scans require their parent')
  integer(record, 'childCount', 100)
  metrics(record.metrics)
  bestDiscussion(record.bestDiscussion)
}
export function parseModerationSummaryCollection(data: unknown): void {
  const record = asRecord(data, 'collection')
  assertExactKeys(record, [
    'eventId',
    'phase',
    'afterMembershipId',
    'upperMembershipId',
    'activityWindowEnd',
    'eligibleCount',
    'top',
    'discussionCommunityIndex',
    'scan',
  ])
  if (!['memberships', 'community', 'discussions', 'ready'].includes(String(record.phase)))
    throw new JobPayloadError('Invalid moderation summary collection phase')
  identifier(record, 'eventId')
  identifier(record, 'afterMembershipId')
  if (
    record.activityWindowEnd !== null &&
    (typeof record.activityWindowEnd !== 'string' ||
      !Number.isFinite(Date.parse(record.activityWindowEnd)))
  )
    throw new JobPayloadError('Invalid activity window end')
  if (record.upperMembershipId !== null) identifier(record, 'upperMembershipId')
  integer(record, 'eligibleCount', 120)
  integer(record, 'discussionCommunityIndex', 20)
  if (!Array.isArray(record.top) || record.top.length > 20)
    throw new JobPayloadError('top must contain at most 20 communities')
  const seen = new Set<string>()
  for (const item of record.top) {
    const row = asRecord(item, 'top community')
    assertExactKeys(row, ['communityId', 'pendingScore', 'discussionPostId', 'metrics'])
    identifier(row, 'communityId')
    if (row.discussionPostId !== null) identifier(row, 'discussionPostId')
    integer(row, 'pendingScore', 500)
    metrics(row.metrics)
    if (seen.has(String(row.communityId)))
      throw new JobPayloadError('top communities must be unique')
    seen.add(String(row.communityId))
  }
  scan(record.scan)
  if (record.phase === 'community' && record.scan === null)
    throw new JobPayloadError('Rank collection requires a scan')
  if (Number(record.discussionCommunityIndex) > record.top.length)
    throw new JobPayloadError('Discussion position exceeds selected communities')
  if (Number(record.eligibleCount) < record.top.length)
    throw new JobPayloadError('Eligible count excludes selected communities')
}
