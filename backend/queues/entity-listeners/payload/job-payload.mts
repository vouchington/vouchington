import { parseReconciliationDispatch } from './job-payload-reconciliation.mts'
import type { EntityJobs } from '../types.mts'
import {
  communityPromptPayload,
  conversationPayload,
  entityJobContractCoversCanonicalTypes,
  followPayload,
  parseReconcileEntity,
  topicPayload,
  topicUpdatedPayload,
  userWithContext,
} from './job-payload-records.mts'
import {
  asRecord,
  assertExactKeys,
  JobPayloadError,
  optionalBoolean,
  requiredString,
} from './job-payload-read.mts'

export { entityJobContractCoversCanonicalTypes, JobPayloadError }

const parsers = {
  enqueueReconcileEntities: emptyPayload,
  reconcileEntity: parseReconcileEntity,
  reconcileEntities: parseReconciliationDispatch,
  processUrlCreated: idPayload,
  processUrlUpdated: emptyPayload,
  processUrlDeleted: emptyPayload,
  processImageCreated: idPayload,
  processImageUpdated: emptyPayload,
  processImageDeleted: emptyPayload,
  processUserCreated: userWithContext,
  processUserUpdated: idPayload,
  processUserLoggedIn: userWithContext,
  processUserDeleted: idPayload,
  processAutoFollowReferrer: followPayload,
  processPostCreated: idPayload,
  processPostUpdated: postUpdatedPayload,
  processPostDeleted: idPayload,
  processTopicCreated: topicPayload,
  processTopicUpdated: topicUpdatedPayload,
  processTopicDeleted: topicPayload,
  processConversationMessageCreated: conversationPayload,
  processCommunityAgentPromptsDeactivated: communityPromptPayload,
} as const satisfies Record<EntityJobs, (data: unknown) => Record<string, unknown>>

export function parseEntityJob(
  name: string,
  data: unknown,
): { name: EntityJobs; data: Record<string, unknown> } {
  if (!isEntityJob(name)) throw new JobPayloadError(`unknown job ${name}`)
  return { name, data: parsers[name](data) }
}

function isEntityJob(name: string): name is EntityJobs {
  return Object.hasOwn(parsers, name)
}

function emptyPayload(data: unknown): Record<string, unknown> {
  if (data == null) return {}
  const record = asRecord(data, 'payload')
  assertExactKeys(record, [])
  return record
}

function idPayload(data: unknown): Record<string, unknown> {
  const record = asRecord(data, 'payload')
  assertExactKeys(record, ['id'])
  requiredString(record, 'id')
  return record
}

function postUpdatedPayload(data: unknown): Record<string, unknown> {
  const record = asRecord(data, 'payload')
  assertExactKeys(record, ['id', 'contentChanged'])
  requiredString(record, 'id')
  optionalBoolean(record, 'contentChanged')
  return record
}
