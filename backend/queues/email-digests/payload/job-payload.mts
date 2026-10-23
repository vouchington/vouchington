import { JobPayloadError } from '@queues/emails/payload/job-payload-error'
import { parseEmailInput } from '@queues/emails/payload/job-payload-input'
import { asRecord, assertExactKeys, optionalString } from '@queues/emails/payload/job-payload-read'
import type {
  EmailDigestDispatcherJobs,
  EmailDigestSendJobs,
  EmailJobInput,
} from '@queues/emails/types'
import { DISPATCHER_JOB_NAMES, dispatcherPayload } from './job-payload-dispatcher.mts'
import { parseEngagementVariables } from './job-payload-engagement.mts'

export { JobPayloadError }

type TemplateName = Exclude<EmailDigestSendJobs, 'processSendApiKeyExpiryReminder'>

/** A job's name as the registry spells it, without the `email-digests.` domain prefix. */
export type ParsedEmailDigestJob =
  | { kind: 'dispatcher'; name: EmailDigestDispatcherJobs; data: { afterId?: string } }
  | { kind: 'api-key-expiry'; apiKeyId: string }
  | {
      kind: 'template'
      name: TemplateName
      input: EmailJobInput & { claimOwnerJobId?: string }
      variables: Record<string, unknown>
    }

const API_KEY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseEmailDigestJob(name: string, data: unknown): ParsedEmailDigestJob {
  if (isDispatcher(name)) {
    return { kind: 'dispatcher', name, data: dispatcherPayload(name, data) }
  }
  if (name === 'processSendApiKeyExpiryReminder') {
    const record = asRecord(data, 'payload')
    assertExactKeys(record, ['apiKeyId'])
    if (typeof record.apiKeyId !== 'string' || !API_KEY_ID.test(record.apiKeyId)) {
      throw new JobPayloadError('apiKeyId must be a UUID')
    }
    return { kind: 'api-key-expiry', apiKeyId: record.apiKeyId }
  }
  if (!isTemplate(name)) throw new JobPayloadError(`unknown job ${name}`)
  const record = asRecord(data, 'payload')
  assertExactKeys(record, ['input', 'variables'])
  const inputRecord = asRecord(record.input, 'input')
  optionalString(inputRecord, 'claimOwnerJobId')
  if (
    inputRecord.claimOwnerJobId !== undefined &&
    ![
      'processSendFollowTopicsEmail',
      'processSendPostReferralLinkEmail',
      'processSendFollowNewsSourcesEmail',
    ].includes(name)
  )
    throw new JobPayloadError('claimOwnerJobId is only valid for engagement sends')
  const { claimOwnerJobId, ...emailInput } = inputRecord
  return {
    kind: 'template',
    name,
    input: {
      ...parseEmailInput(emailInput),
      ...(typeof claimOwnerJobId === 'string' && { claimOwnerJobId }),
    },
    variables: parseEngagementVariables[name](record.variables),
  }
}

function isDispatcher(name: string): name is EmailDigestDispatcherJobs {
  return (DISPATCHER_JOB_NAMES as readonly string[]).includes(name)
}

function isTemplate(name: string): name is TemplateName {
  return Object.hasOwn(parseEngagementVariables, name)
}
