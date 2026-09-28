import { topicTypes } from '@voucha/types/entities/topic'
import type { CreateTopicUpdates, ReconcileEntityData, UserLoginContext } from './types.mts'
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

const oauthProviders = [
  'facebook',
  'apple',
  'google',
  'x',
  'linkedin',
  'microsoft',
  'github',
] as const
const userLoginKeys = [
  'oauth_provider',
  'oauth_user_id',
  'email_address',
  'phone_number',
  'device_id',
  'session_id',
  'ip_address',
  'user_agent',
] as const
const topicUpdateRequired = ['name', 'slug'] as const
const topicUpdateOptional = [
  'markdown',
  'topic_type',
  'noindex',
  'allow_reviews',
  'updated_by_id',
  'hostname',
  'homepage_url_id',
  'logo_image_id',
  'hero_image_id',
  'rewards_program_id',
  'referral_program_id',
  'source_topic_alias_id',
] as const
const reconcileRequired = ['entityType', 'entityId', 'changedAtEpochUs'] as const
const reconcileOptional = ['changeId', 'contentChanged', 'referrerId'] as const
const entityTypes = [
  'user',
  'topic',
  'post_created',
  'post_updated',
  'post_deleted',
  'image',
  'url',
] as const
const topicIdKeys = [
  'homepage_url_id',
  'logo_image_id',
  'hero_image_id',
  'rewards_program_id',
  'referral_program_id',
  'source_topic_alias_id',
] as const

export function entityJobContractCoversCanonicalTypes(): true {
  const userLoginCovered: Exclude<
    keyof UserLoginContext,
    (typeof userLoginKeys)[number]
  > extends never
    ? true
    : never = true
  const topicCovered: Exclude<
    keyof CreateTopicUpdates,
    (typeof topicUpdateRequired)[number] | (typeof topicUpdateOptional)[number]
  > extends never
    ? true
    : never = true
  const reconcileCovered: Exclude<
    keyof ReconcileEntityData,
    (typeof reconcileRequired)[number] | (typeof reconcileOptional)[number]
  > extends never
    ? true
    : never = true
  const entityTypeCovered: Exclude<
    ReconcileEntityData['entityType'],
    (typeof entityTypes)[number]
  > extends never
    ? true
    : never = true
  const providerCovered: Exclude<
    NonNullable<UserLoginContext['oauth_provider']>,
    (typeof oauthProviders)[number]
  > extends never
    ? true
    : never = true
  return (
    userLoginCovered && topicCovered && reconcileCovered && entityTypeCovered && providerCovered
  )
}

export function userWithContext(data: unknown): Record<string, unknown> {
  const record = asRecord(data, 'payload')
  assertExactKeys(record, ['id', 'context'])
  requiredString(record, 'id')
  const context = asRecord(record.context, 'context')
  assertExactKeys(context, userLoginKeys)
  optionalEnum(context, 'oauth_provider', oauthProviders)
  for (const key of userLoginKeys) {
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
  assertExactKeys(updates, [...topicUpdateRequired, ...topicUpdateOptional])
  requiredString(updates, 'name')
  requiredString(updates, 'slug')
  optionalString(updates, 'markdown')
  optionalEnum(updates, 'topic_type', Object.keys(topicTypes))
  optionalBoolean(updates, 'noindex')
  optionalBoolean(updates, 'allow_reviews')
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
  assertExactKeys(record, [...reconcileRequired, ...reconcileOptional])
  requiredEnum(record, 'entityType', entityTypes)
  requiredString(record, 'entityId')
  requiredString(record, 'changedAtEpochUs')
  optionalString(record, 'changeId')
  optionalBoolean(record, 'contentChanged')
  optionalString(record, 'referrerId')
  return record
}
