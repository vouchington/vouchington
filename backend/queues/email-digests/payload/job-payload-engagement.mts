import { parseModerationSummaryCollection } from './moderation-summary-collection.mts'
import type { ModerationSummaryNext } from '@queues/background/enqueues/moderation-summary-state'
import type {
  ProcessSendFollowNewsSourcesEmailVariables,
  ProcessSendFollowTopicsEmailVariables,
  ProcessSendPostReferralLinkEmailVariables,
} from '@queues/background/enqueues/email-digests-domain'
import {
  communityItemVariableKeys,
  moderationVariableKeys,
  referralItemVariableKeys,
  referralsVariableKeys,
  sourceItemVariableKeys,
  sourcesVariableKeys,
  topicItemVariableKeys,
  topicsVariableKeys,
} from './job-payload-contract.mts'
import { JobPayloadError } from '@queues/emails/payload/job-payload-error'
import {
  assertExactKeys,
  asRecord,
  optionalNullableString,
  optionalString,
  requiredString,
} from '@queues/emails/payload/job-payload-read'

const communityCountKeys: readonly string[] = Object.entries(communityItemVariableKeys).flatMap(
  ([key, kind]) => (kind === 'number' ? [key] : []),
)

export const parseEngagementVariables = {
  processSendFollowTopicsEmail: (data: unknown) =>
    listVariables<ProcessSendFollowTopicsEmailVariables>(
      data,
      'topics',
      topicsVariableKeys,
      topicItem,
    ),
  processSendPostReferralLinkEmail: (data: unknown) =>
    listVariables<ProcessSendPostReferralLinkEmailVariables>(
      data,
      'referralPrograms',
      referralsVariableKeys,
      referralItem,
    ),
  processSendFollowNewsSourcesEmail: (data: unknown) =>
    listVariables<ProcessSendFollowNewsSourcesEmailVariables>(
      data,
      'sources',
      sourcesVariableKeys,
      sourceItem,
    ),
  processSendCommunityModerationSummaryEmail: (data: unknown) => moderationVariables(data, 'send'),
}

function listVariables<T>(
  data: unknown,
  listKey: keyof T & string,
  allowed: Record<keyof T & string, unknown>,
  readItem: (item: unknown) => void,
): Record<string, unknown> {
  const record = asRecord(data, 'variables')
  assertExactKeys(record, Object.keys(allowed))
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
  const record = asRecord(item, 'variables')
  assertExactKeys(record, Object.keys(topicItemVariableKeys))
  requiredString(record, 'name')
  requiredString(record, 'url')
  optionalString(record, 'reason')
}

function referralItem(item: unknown): void {
  const record = asRecord(item, 'variables')
  assertExactKeys(record, Object.keys(referralItemVariableKeys))
  requiredString(record, 'name')
  requiredString(record, 'url')
  optionalNumber(record, 'linkCount')
}

function sourceItem(item: unknown): void {
  const record = asRecord(item, 'variables')
  assertExactKeys(record, Object.keys(sourceItemVariableKeys))
  requiredString(record, 'name')
  requiredString(record, 'url')
  optionalString(record, 'description')
}

/** A stage job carries the same variables as the send; only its collection state differs. */
export function moderationVariables(
  data: unknown,
  stage: ModerationSummaryNext,
): Record<string, unknown> {
  const record = asRecord(data, 'variables')
  assertExactKeys(record, Object.keys(moderationVariableKeys))
  requiredString(record, 'generatedForDate')
  requiredString(record, 'dispatchTimeZone')
  requiredString(record, 'settingsUrl')
  optionalString(record, 'userName')
  optionalString(record, 'unsubscribeUrl')
  optionalString(record, 'physicalAddress')
  optionalNullableString(record, 'uiLocale')
  parseModerationSummaryCollection(record.collection, stage)
  if (
    typeof record.remainingCommunityCount !== 'number' ||
    !Number.isSafeInteger(record.remainingCommunityCount) ||
    record.remainingCommunityCount < 0 ||
    record.remainingCommunityCount > 100
  )
    throw new JobPayloadError('Invalid remainingCommunityCount')
  if (!Array.isArray(record.communities)) throw new JobPayloadError('communities must be an array')
  if (record.communities.length > 20)
    throw new JobPayloadError('communities must contain at most 20 cards')
  for (const community of record.communities) communityItem(community)
  return record
}

function communityItem(item: unknown): void {
  const record = asRecord(item, 'variables')
  assertExactKeys(record, Object.keys(communityItemVariableKeys))
  requiredString(record, 'name')
  requiredString(record, 'url')
  requiredString(record, 'communityId')
  for (const key of ['netMemberChange', 'activeMemberRate'])
    if (record[key] !== null && (typeof record[key] !== 'number' || !Number.isFinite(record[key])))
      throw new JobPayloadError(`${key} must be a finite number or null`)
  const title = record.topDiscussionTitle
  if (title !== null && typeof title !== 'string') {
    throw new JobPayloadError('topDiscussionTitle must be a string or null')
  }
  for (const key of communityCountKeys) {
    if (
      typeof record[key] !== 'number' ||
      !Number.isInteger(record[key]) ||
      record[key] < 0 ||
      record[key] > 100
    ) {
      throw new JobPayloadError(`${key} must be a number`)
    }
  }
}

function optionalNumber(record: Record<string, unknown>, key: string): void {
  const value = record[key]
  if (value === undefined) return
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new JobPayloadError(`${key} must be a number`)
  }
}
