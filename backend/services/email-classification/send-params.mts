import { createListUnsubscribeHeaders } from '@services/users'
import { EMAIL_CLASSIFICATIONS, type EmailType } from './registry.mts'

export type ClassifiedSendContext = {
  userId?: string
}

export type ClassifiedSendParams = {
  headers?: Record<string, string>
  configurationSetName?: string
}

export function buildClassifiedSendParams(
  type: EmailType,
  ctx: ClassifiedSendContext,
): ClassifiedSendParams {
  const entry = EMAIL_CLASSIFICATIONS[type]

  if (entry.classification === 'transactional') {
    return {
      configurationSetName: process.env.SES_CONFIGURATION_SET_TRANSACTIONAL || undefined,
    }
  }

  const configurationSetName = process.env.SES_CONFIGURATION_SET_MARKETING || undefined

  if (!ctx.userId) {
    throw new TypeError(`sendClassifiedEmail(${type}, ...) requires ctx.userId`)
  }
  return {
    headers: createListUnsubscribeHeaders(ctx.userId, entry.unsubscribe.category),
    configurationSetName,
  }
}
