import type {
  EmailDispatcherJobs,
  EmailJobInput,
  EmailJobs,
  EmailSendJobs,
  ProcessSendCommunityInviteEmailVariables,
  ProcessSendEmailAddressLoginTokenVariables,
  ProcessSendEmailVerificationTokenVariables,
  ProcessSendWelcomeEmailVariables,
} from '../types.mts'
import { parseEngagementVariables } from './job-payload-engagement.mts'
import { emailVariableKeysCoverCanonicalTypes } from './job-payload-contract.mts'
import { JobPayloadError } from './job-payload-error.mts'
import {
  asRecord,
  assertExactKeys,
  optionalNullableString,
  optionalString,
} from './job-payload-read.mts'
import {
  applicationDecisionVariables,
  dataExportVariables,
  ownershipVariables,
  roleChangeVariables,
  stringVariables,
} from './job-payload-templates.mts'

export { JobPayloadError }

type TemplateName = Exclude<EmailSendJobs, 'processSendCopyrightNoticeEmail'>

export type ParsedEmailJob =
  | { kind: 'dispatcher'; name: EmailDispatcherJobs }
  | { kind: 'copyright'; data: { intentId: string } }
  | {
      kind: 'template'
      name: TemplateName
      input: EmailJobInput
      variables: Record<string, unknown>
    }

const dispatcherJobs = [
  'dispatchEngagementEmails',
  'dispatchCommunityModerationSummaryEmails',
] as const satisfies readonly EmailDispatcherJobs[]

const templateParsers = {
  processSendCommunityInviteEmail: (data: unknown) =>
    stringVariables<ProcessSendCommunityInviteEmailVariables>(data, [
      'communityName',
      'inviterName',
      'code',
    ]),
  processSendEmailAddressLoginToken: (data: unknown) =>
    stringVariables<ProcessSendEmailAddressLoginTokenVariables>(data, ['token', 'expiration']),
  processSendDataExportReadyEmail: dataExportVariables,
  processSendEmailVerificationToken: (data: unknown) =>
    stringVariables<ProcessSendEmailVerificationTokenVariables>(data, ['token']),
  processSendWelcomeEmail: (data: unknown) =>
    stringVariables<ProcessSendWelcomeEmailVariables>(data, [], ['userName']),
  processSendCommunityApplicationDecisionEmail: applicationDecisionVariables,
  processSendCommunityRoleChangeEmail: roleChangeVariables,
  processSendCommunityOwnershipTransferEmail: ownershipVariables,
  ...parseEngagementVariables,
} as const satisfies Record<TemplateName, (data: unknown) => Record<string, unknown>>

export function parseEmailJob(name: string, data: unknown): ParsedEmailJob {
  if (isDispatcher(name)) {
    emptyPayload(data)
    return { kind: 'dispatcher', name }
  }
  if (name === 'processSendCopyrightNoticeEmail') {
    return { kind: 'copyright', data: copyrightPayload(data) }
  }
  if (!isTemplate(name)) throw new JobPayloadError(`unknown job ${name}`)
  const record = asRecord(data, 'payload')
  assertExactKeys(record, ['input', 'variables'])
  return {
    kind: 'template',
    name,
    input: emailInput(record.input),
    variables: templateParsers[name](record.variables),
  }
}

export function emailJobContractCoversCanonicalTypes(): true {
  const dispatchers: Exclude<EmailDispatcherJobs, (typeof dispatcherJobs)[number]> extends never
    ? true
    : never = true
  const templates: Exclude<TemplateName, keyof typeof templateParsers> extends never
    ? true
    : never = true
  const jobs: Exclude<EmailJobs, EmailDispatcherJobs | EmailSendJobs> extends never ? true : never =
    true
  return dispatchers && templates && jobs && emailVariableKeysCoverCanonicalTypes()
}

function isDispatcher(name: string): name is EmailDispatcherJobs {
  return dispatcherJobs.some(job => job === name)
}

function isTemplate(name: string): name is TemplateName {
  return Object.hasOwn(templateParsers, name)
}

function emptyPayload(data: unknown): void {
  if (data == null) return
  const record = asRecord(data, 'payload')
  assertExactKeys(record, [])
}

function copyrightPayload(data: unknown): { intentId: string } {
  const record = asRecord(data, 'payload')
  assertExactKeys(record, ['intentId'])
  const intentId = record.intentId
  if (typeof intentId !== 'string') throw new JobPayloadError('copyright payload must set intentId')
  return { intentId }
}

function emailInput(data: unknown): EmailJobInput {
  const record = asRecord(data, 'input')
  assertExactKeys(record, [
    'emailAddress',
    'userId',
    'trackingKey',
    'windowStart',
    'windowEnd',
    'uiLocale',
    'subject',
    'text',
    'html',
  ])
  const emailAddress = record.emailAddress
  const userId = record.userId
  optionalInputMetadata(record)
  const metadata = inputMetadata(record)
  if (typeof emailAddress === 'string' && userId === undefined) return { emailAddress, ...metadata }
  if (typeof userId === 'string' && emailAddress === undefined) return { userId, ...metadata }
  throw new JobPayloadError('input must set emailAddress or userId')
}

function inputMetadata(record: Record<string, unknown>): {
  trackingKey?: string
  windowStart?: string
  windowEnd?: string
  uiLocale?: string | null
  subject?: string
  text?: string
  html?: string
} {
  return {
    ...(typeof record.trackingKey === 'string' ? { trackingKey: record.trackingKey } : {}),
    ...(typeof record.windowStart === 'string' ? { windowStart: record.windowStart } : {}),
    ...(typeof record.windowEnd === 'string' ? { windowEnd: record.windowEnd } : {}),
    ...(typeof record.subject === 'string' ? { subject: record.subject } : {}),
    ...(typeof record.text === 'string' ? { text: record.text } : {}),
    ...(typeof record.html === 'string' ? { html: record.html } : {}),
    ...(record.uiLocale === null || typeof record.uiLocale === 'string'
      ? { uiLocale: record.uiLocale }
      : {}),
  }
}

function optionalInputMetadata(record: Record<string, unknown>): void {
  for (const key of [
    'trackingKey',
    'windowStart',
    'windowEnd',
    'subject',
    'text',
    'html',
  ] as const) {
    optionalString(record, key)
  }
  optionalNullableString(record, 'uiLocale')
}
