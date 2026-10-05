import { topicTypes } from '@voucha/types/entities/topic'
import type { CreateTopicUpdates, ReconcileEntityData, UserLoginContext } from '../types.mts'
import {
  asRecord,
  assertExactKeys,
  optionalBoolean,
  optionalEnum,
  optionalNullableString,
  optionalString,
  requiredEnum,
  requiredString,
} from './job-payload-read.mts'

const oauthProviders = {
  facebook: true,
  apple: true,
  google: true,
  x: true,
  linkedin: true,
  microsoft: true,
  github: true,
} as const satisfies Record<NonNullable<UserLoginContext['oauth_provider']>, true>
const userLoginKeys = {
  oauth_provider: true,
  oauth_user_id: true,
  email_address: true,
  phone_number: true,
  device_id: true,
  session_id: true,
  ip_address: true,
  user_agent: true,
} as const satisfies Record<keyof UserLoginContext, true>
const topicUpdateKeys = {
  name: true,
  slug: true,
  markdown: true,
  topic_type: true,
  is_noindexed: true,
  should_allow_reviews: true,
  updated_by_id: true,
  hostname: true,
  homepage_url_id: true,
  logo_image_id: true,
  hero_image_id: true,
  rewards_program_id: true,
  referral_program_id: true,
  source_topic_alias_id: true,
} as const satisfies Record<keyof CreateTopicUpdates, true>
const reconcileKeys = {
  entityType: true,
  entityId: true,
  changedAtEpochUs: true,
  changeId: true,
  contentChanged: true,
  referrerId: true,
} as const satisfies Record<keyof ReconcileEntityData, true>
const entityTypes = {
  user: true,
  topic: true,
  post_created: true,
  post_updated: true,
  post_deleted: true,
  image: true,
  url: true,
} as const satisfies Record<ReconcileEntityData['entityType'], true>
const topicIdKeys = [
  'homepage_url_id',
  'logo_image_id',
  'hero_image_id',
  'rewards_program_id',
  'referral_program_id',
  'source_topic_alias_id',
] as const

export function userWithContext(data: unknown): Record<string, unknown> {
  const record = asRecord(data, 'payload')
  assertExactKeys(record, ['id', 'context'])
  requiredString(record, 'id')
  const context = asRecord(record.context, 'context')
  assertExactKeys(context, Object.keys(userLoginKeys))
  optionalEnum(context, 'oauth_provider', Object.keys(oauthProviders))
  for (const key of Object.keys(userLoginKeys)) {
    if (key !== 'oauth_provider') optionalString(context, key)
  }
  return record
}

export function followPayload(data: unknown): Record<string, unknown> {
  const record = asRecord(data, 'payload')
  assertExactKeys(record, ['newUserId', 'referrerId'])
  requiredString(record, 'newUserId')
  requiredString(record, 'referrerId')
  return record
}

export function topicUpdatedPayload(data: unknown): Record<string, unknown> {
  const record = asRecord(data, 'payload')
  assertExactKeys(record, ['id', 'updated_by_id'])
  requiredString(record, 'id')
  optionalString(record, 'updated_by_id')
  return record
}

export function topicPayload(data: unknown): Record<string, unknown> {
  const record = asRecord(data, 'payload')
  assertExactKeys(record, ['id', 'updates'])
  requiredString(record, 'id')
  const updates = asRecord(record.updates, 'updates')
  assertExactKeys(updates, Object.keys(topicUpdateKeys))
  requiredString(updates, 'name')
  requiredString(updates, 'slug')
  optionalString(updates, 'markdown')
  optionalEnum(updates, 'topic_type', Object.keys(topicTypes))
  optionalBoolean(updates, 'is_noindexed')
  optionalBoolean(updates, 'should_allow_reviews')
  optionalString(updates, 'updated_by_id')
  optionalNullableString(updates, 'hostname')
  for (const key of topicIdKeys) {
    if (key === 'source_topic_alias_id') optionalString(updates, key)
    else optionalNullableString(updates, key)
  }
  return record
}

export function conversationPayload(data: unknown): Record<string, unknown> {
  const record = asRecord(data, 'payload')
  assertExactKeys(record, ['conversationId', 'messageId', 'senderId'])
  requiredString(record, 'conversationId')
  requiredString(record, 'messageId')
  requiredString(record, 'senderId')
  return record
}

export function communityPromptPayload(data: unknown): Record<string, unknown> {
  const record = asRecord(data, 'payload')
  assertExactKeys(record, ['actorUserId', 'userId', 'communityId'])
  requiredString(record, 'actorUserId')
  requiredString(record, 'userId')
  requiredString(record, 'communityId')
  return record
}

export function parseReconcileEntity(data: unknown): Record<string, unknown> {
  const record = asRecord(data, 'payload')
  assertExactKeys(record, Object.keys(reconcileKeys))
  requiredEnum(record, 'entityType', Object.keys(entityTypes))
  requiredString(record, 'entityId')
  requiredString(record, 'changedAtEpochUs')
  optionalString(record, 'changeId')
  optionalBoolean(record, 'contentChanged')
  optionalString(record, 'referrerId')
  return record
}
