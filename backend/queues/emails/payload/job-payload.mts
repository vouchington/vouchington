import type {
  EmailJobInput,
  EmailSendJobs,
  ProcessSendCommunityInviteEmailVariables,
  ProcessSendEmailAddressLoginTokenVariables,
  ProcessSendEmailVerificationTokenVariables,
  ProcessSendWelcomeEmailVariables,
} from '../types.mts'
import {
  inviteVariableKeys,
  loginVariableKeys,
  verificationVariableKeys,
  welcomeVariableKeys,
} from './job-payload-contract.mts'
import { JobPayloadError } from './job-payload-error.mts'
import { parseEmailInput } from './job-payload-input.mts'
import { asRecord, assertExactKeys } from './job-payload-read.mts'
import {
  applicationDecisionVariables,
  dataExportVariables,
  ownershipVariables,
  roleChangeVariables,
  reauthenticationVariables,
  stringVariables,
} from './job-payload-templates.mts'

export { JobPayloadError }

type TemplateName = Exclude<EmailSendJobs, 'processSendCopyrightNoticeEmail'>

export type ParsedEmailJob =
  | { kind: 'copyright'; data: { intentId: string } }
  | {
      kind: 'template'
      name: TemplateName
      input: EmailJobInput
      variables: Record<string, unknown>
    }

const templateParsers = {
  processSendCommunityInviteEmail: (data: unknown) =>
    stringVariables<ProcessSendCommunityInviteEmailVariables>(data, inviteVariableKeys, [
      'communityName',
      'inviterName',
      'code',
    ]),
  processSendEmailAddressLoginToken: (data: unknown) =>
    stringVariables<ProcessSendEmailAddressLoginTokenVariables>(data, loginVariableKeys, [
      'token',
      'expiration',
    ]),
  processSendDataExportReadyEmail: dataExportVariables,
  processSendReauthenticationToken: reauthenticationVariables,
  processSendEmailVerificationToken: (data: unknown) =>
    stringVariables<ProcessSendEmailVerificationTokenVariables>(data, verificationVariableKeys, [
      'token',
    ]),
  processSendWelcomeEmail: (data: unknown) =>
    stringVariables<ProcessSendWelcomeEmailVariables>(data, welcomeVariableKeys, [], ['userName']),
  processSendCommunityApplicationDecisionEmail: applicationDecisionVariables,
  processSendCommunityRoleChangeEmail: roleChangeVariables,
  processSendCommunityOwnershipTransferEmail: ownershipVariables,
} as const satisfies Record<TemplateName, (data: unknown) => Record<string, unknown>>

export function parseEmailJob(name: string, data: unknown): ParsedEmailJob {
  if (name === 'processSendCopyrightNoticeEmail') {
    return { kind: 'copyright', data: copyrightPayload(data) }
  }
  if (!isTemplate(name)) throw new JobPayloadError(`unknown job ${name}`)
  const record = asRecord(data, 'payload')
  assertExactKeys(record, ['input', 'variables'])
  return {
    kind: 'template',
    name,
    input: parseEmailInput(record.input),
    variables: templateParsers[name](record.variables),
  }
}

function isTemplate(name: string): name is TemplateName {
  return Object.hasOwn(templateParsers, name)
}

function copyrightPayload(data: unknown): { intentId: string } {
  const record = asRecord(data, 'payload')
  assertExactKeys(record, ['intentId'])
  const intentId = record.intentId
  if (typeof intentId !== 'string') throw new JobPayloadError('copyright payload must set intentId')
  return { intentId }
}
