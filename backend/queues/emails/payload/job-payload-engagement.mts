import type {
  ProcessSendCommunityModerationSummaryEmailVariables,
  ProcessSendFollowNewsSourcesEmailVariables,
  ProcessSendFollowTopicsEmailVariables,
  ProcessSendPostReferralLinkEmailVariables,
} from './types.mts'
import { JobPayloadError } from './job-payload-error.mts'

export const communityCountKeys = [
  'pendingPostReviews',
  'pendingApplications',
  'pendingReports',
  'escalatedItems',
  'suspectedBanEvaders',
  'netMemberChange',
  'totalActiveMembers',
  'newDiscussionPosts',
  'newReviewPosts',
  'newDataPointPosts',
  'topDiscussionReplyCount',
  'activeMemberCount',
  'activeMemberRate',
] as const

export const parseEngagementVariables = {
  processSendFollowTopicsEmail: (data: unknown) =>
    listVariables<ProcessSendFollowTopicsEmailVariables>(data, 'topics', topicItem),
  processSendPostReferralLinkEmail: (data: unknown) =>
    listVariables<ProcessSendPostReferralLinkEmailVariables>(
      data,
      'referralPrograms',
      referralItem,
    ),
  processSendFollowNewsSourcesEmail: (data: unknown) =>
    listVariables<ProcessSendFollowNewsSourcesEmailVariables>(data, 'sources', sourceItem),
  processSendCommunityModerationSummaryEmail: moderationVariables,
}

function listVariables<T>(
  data: unknown,
  listKey: keyof T & string,
  readItem: (item: unknown) => void,
): Record<string, unknown> {
  const record = asRecord(data)
  assertExactKeys(record, [
    listKey,
    'userName',
    'settingsUrl',
    'unsubscribeUrl',
    'physicalAddress',
    'uiLocale',
  ])
  requiredString(record, 'settingsUrl')
  requiredString(record, 'unsubscribeUrl')
  optionalString(record, 'userName')
  optionalString(record, 'physicalAddress')
  optionalNullableString(record, 'uiLocale')
  const items = record[listKey]
  if (!Array.isArray(items)) throw new JobPayloadError(`${listKey} must be an array`)
  for (const item of items) readItem(item)
  return record
}

function topicItem(item: unknown): void {
  const record = asRecord(item)
  assertExactKeys(record, ['name', 'url', 'reason'])
  requiredString(record, 'name')
  requiredString(record, 'url')
  optionalString(record, 'reason')
}

function referralItem(item: unknown): void {
  const record = asRecord(item)
  assertExactKeys(record, ['name', 'url', 'linkCount'])
  requiredString(record, 'name')
  requiredString(record, 'url')
  optionalNumber(record, 'linkCount')
}

function sourceItem(item: unknown): void {
  const record = asRecord(item)
  assertExactKeys(record, ['name', 'url', 'description'])
  requiredString(record, 'name')
  requiredString(record, 'url')
  optionalString(record, 'description')
}

function moderationVariables(data: unknown): Record<string, unknown> {
  const record = asRecord(data)
  assertExactKeys(record, [
    'userName',
    'generatedForDate',
    'settingsUrl',
    'unsubscribeUrl',
    'physicalAddress',
    'uiLocale',
    'communities',
  ])
  requiredString(record, 'generatedForDate')
  requiredString(record, 'settingsUrl')
  optionalString(record, 'userName')
  optionalString(record, 'unsubscribeUrl')
  optionalString(record, 'physicalAddress')
  optionalNullableString(record, 'uiLocale')
  if (!Array.isArray(record.communities)) throw new JobPayloadError('communities must be an array')
  for (const community of record.communities) communityItem(community)
  return record
}

function communityItem(item: unknown): void {
  const record = asRecord(item)
  assertExactKeys(record, ['name', 'url', 'topDiscussionTitle', ...communityCountKeys])
  requiredString(record, 'name')
  requiredString(record, 'url')
  const title = record.topDiscussionTitle
  if (title !== null && typeof title !== 'string') {
    throw new JobPayloadError('topDiscussionTitle must be a string or null')
  }
  for (const key of communityCountKeys) {
    if (typeof record[key] !== 'number' || Number.isNaN(record[key])) {
      throw new JobPayloadError(`${key} must be a number`)
    }
  }
}

function asRecord(data: unknown): Record<string, unknown> {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new JobPayloadError('variables must be an object')
  }
  return data
}

function assertExactKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) throw new JobPayloadError(`unexpected property ${key}`)
  }
}

function requiredString(record: Record<string, unknown>, key: string): void {
  if (typeof record[key] !== 'string') throw new JobPayloadError(`${key} must be a string`)
}

function optionalString(record: Record<string, unknown>, key: string): void {
  const value = record[key]
  if (value === undefined) return
  if (typeof value !== 'string') throw new JobPayloadError(`${key} must be a string`)
}

function optionalNullableString(record: Record<string, unknown>, key: string): void {
  const value = record[key]
  if (value === undefined || value === null) return
  if (typeof value !== 'string') throw new JobPayloadError(`${key} must be a string or null`)
}

function optionalNumber(record: Record<string, unknown>, key: string): void {
  const value = record[key]
  if (value === undefined) return
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new JobPayloadError(`${key} must be a number`)
  }
}
