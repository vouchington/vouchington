import type {
  ProcessSendFollowNewsSourcesEmailVariables,
  ProcessSendFollowTopicsEmailVariables,
  ProcessSendPostReferralLinkEmailVariables,
} from '../types.mts'
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
import { JobPayloadError } from './job-payload-error.mts'

const communityCountKeyList: string[] = []
for (const [key, kind] of Object.entries(communityItemVariableKeys)) {
  if (kind === 'number') communityCountKeyList.push(key)
}
export const communityCountKeys: readonly string[] = communityCountKeyList

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
  processSendCommunityModerationSummaryEmail: moderationVariables,
}

function listVariables<T>(
  data: unknown,
  listKey: keyof T & string,
  allowed: Record<keyof T & string, unknown>,
  readItem: (item: unknown) => void,
): Record<string, unknown> {
  const record = asRecord(data)
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
  const record = asRecord(item)
  assertExactKeys(record, Object.keys(topicItemVariableKeys))
  requiredString(record, 'name')
  requiredString(record, 'url')
  optionalString(record, 'reason')
}

function referralItem(item: unknown): void {
  const record = asRecord(item)
  assertExactKeys(record, Object.keys(referralItemVariableKeys))
  requiredString(record, 'name')
  requiredString(record, 'url')
  optionalNumber(record, 'linkCount')
}

function sourceItem(item: unknown): void {
  const record = asRecord(item)
  assertExactKeys(record, Object.keys(sourceItemVariableKeys))
  requiredString(record, 'name')
  requiredString(record, 'url')
  optionalString(record, 'description')
}

function moderationVariables(data: unknown): Record<string, unknown> {
  const record = asRecord(data)
  assertExactKeys(record, Object.keys(moderationVariableKeys))
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
  assertExactKeys(record, Object.keys(communityItemVariableKeys))
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
  if (!isRecord(data)) throw new JobPayloadError('variables must be an object')
  return data
}

function isRecord(data: unknown): data is Record<string, unknown> {
  return data !== null && typeof data === 'object' && !Array.isArray(data)
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
