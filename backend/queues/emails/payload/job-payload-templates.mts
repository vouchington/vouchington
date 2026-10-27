import type {
  ProcessSendCommunityApplicationDecisionEmailVariables,
  ProcessSendCommunityOwnershipTransferEmailVariables,
  ProcessSendCommunityRoleChangeEmailVariables,
  ProcessSendDataExportReadyEmailVariables,
  ProcessSendReauthenticationTokenVariables,
} from '../types.mts'
import {
  applicationVariableKeys,
  dataExportVariableKeys,
  reauthenticationVariableKeys,
  ownershipVariableKeys,
  roleVariableKeys,
} from './job-payload-contract.mts'
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
  return stringVariables<ProcessSendDataExportReadyEmailVariables>(data, dataExportVariableKeys, [
    'requestId',
  ])
}

export function applicationDecisionVariables(data: unknown): Record<string, unknown> {
  const record = stringVariables<ProcessSendCommunityApplicationDecisionEmailVariables>(
    data,
    applicationVariableKeys,
    ['communityName', 'communityUrl'],
    ['rejectionReason'],
  )
  requiredEnum(record, 'status', ['approved', 'rejected'])
  return record
}

export function roleChangeVariables(data: unknown): Record<string, unknown> {
  const record = stringVariables<ProcessSendCommunityRoleChangeEmailVariables>(
    data,
    roleVariableKeys,
    ['communityName', 'communityUrl'],
  )
  requiredEnum(record, 'newRole', ['owner', 'moderator', 'member'])
  requiredEnum(record, 'direction', ['promoted', 'demoted'])
  return record
}

export function ownershipVariables(data: unknown): Record<string, unknown> {
  const record = stringVariables<ProcessSendCommunityOwnershipTransferEmailVariables>(
    data,
    ownershipVariableKeys,
    ['communityName', 'communityUrl'],
  )
  requiredEnum(record, 'recipientRole', ['new_owner', 'previous_owner'])
  return record
}

export function stringVariables<T>(
  data: unknown,
  allowed: Record<keyof T & string, unknown>,
  required: readonly (keyof T & string)[],
  optional: readonly (keyof T & string)[] = [],
): Record<string, unknown> {
  const record = asRecord(data, 'variables')
  assertExactKeys(record, Object.keys(allowed))
  for (const key of required) requiredString(record, key)
  for (const key of optional) optionalString(record, key)
  optionalNullableString(record, 'uiLocale')
  return record
}

export function reauthenticationVariables(data: unknown): Record<string, unknown> {
  const record = stringVariables<ProcessSendReauthenticationTokenVariables>(
    data,
    reauthenticationVariableKeys,
    ['token'],
  )
  const minutes = record.expiresInMinutes
  if (typeof minutes !== 'number' || !Number.isSafeInteger(minutes) || minutes <= 0) {
    throw new JobPayloadError('expiresInMinutes must be a positive integer')
  }
  return record
}
