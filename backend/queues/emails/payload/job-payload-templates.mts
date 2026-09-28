import type {
  ProcessSendCommunityApplicationDecisionEmailVariables,
  ProcessSendCommunityOwnershipTransferEmailVariables,
  ProcessSendCommunityRoleChangeEmailVariables,
  ProcessSendDataExportReadyEmailVariables,
} from './types.mts'
import { JobPayloadError } from './job-payload-error.mts'
import {
  asRecord,
  assertExactKeys,
  optionalNullableString,
  optionalString,
  requiredEnum,
  requiredString,
} from './job-payload-read.mts'

export function dataExportVariables(data: unknown): Record<string, unknown> {
  const record = stringVariables<ProcessSendDataExportReadyEmailVariables>(
    data,
    ['downloadUrl'],
    [],
    ['expiresInDays'],
  )
  if (typeof record.expiresInDays !== 'number' || Number.isNaN(record.expiresInDays)) {
    throw new JobPayloadError('expiresInDays must be a number')
  }
  return record
}

export function applicationDecisionVariables(data: unknown): Record<string, unknown> {
  const record = stringVariables<ProcessSendCommunityApplicationDecisionEmailVariables>(
    data,
    ['communityName', 'communityUrl'],
    ['rejectionReason'],
    ['status'],
  )
  requiredEnum(record, 'status', ['approved', 'rejected'])
  return record
}

export function roleChangeVariables(data: unknown): Record<string, unknown> {
  const record = stringVariables<ProcessSendCommunityRoleChangeEmailVariables>(
    data,
    ['communityName', 'communityUrl'],
    [],
    ['newRole', 'direction'],
  )
  requiredEnum(record, 'newRole', ['owner', 'moderator', 'member'])
  requiredEnum(record, 'direction', ['promoted', 'demoted'])
  return record
}

export function ownershipVariables(data: unknown): Record<string, unknown> {
  const record = stringVariables<ProcessSendCommunityOwnershipTransferEmailVariables>(
    data,
    ['communityName', 'communityUrl'],
    [],
    ['recipientRole'],
  )
  requiredEnum(record, 'recipientRole', ['new_owner', 'previous_owner'])
  return record
}

export function templateVariableKeysCoverCanonicalTypes(): true {
  const dataExport: Exclude<
    keyof ProcessSendDataExportReadyEmailVariables,
    'downloadUrl' | 'expiresInDays' | 'uiLocale'
  > extends never
    ? true
    : never = true
  const application: Exclude<
    keyof ProcessSendCommunityApplicationDecisionEmailVariables,
    'communityName' | 'communityUrl' | 'rejectionReason' | 'status' | 'uiLocale'
  > extends never
    ? true
    : never = true
  const role: Exclude<
    keyof ProcessSendCommunityRoleChangeEmailVariables,
    'communityName' | 'communityUrl' | 'newRole' | 'direction' | 'uiLocale'
  > extends never
    ? true
    : never = true
  const ownership: Exclude<
    keyof ProcessSendCommunityOwnershipTransferEmailVariables,
    'communityName' | 'communityUrl' | 'recipientRole' | 'uiLocale'
  > extends never
    ? true
    : never = true
  return dataExport && application && role && ownership
}

export function stringVariables<T>(
  data: unknown,
  required: readonly (keyof T & string)[],
  optional: readonly (keyof T & string)[] = [],
  extra: readonly string[] = [],
): Record<string, unknown> {
  const record = asRecord(data, 'variables')
  assertExactKeys(record, [...required, ...optional, ...extra, 'uiLocale'])
  for (const key of required) requiredString(record, key)
  for (const key of optional) optionalString(record, key)
  optionalNullableString(record, 'uiLocale')
  return record
}
