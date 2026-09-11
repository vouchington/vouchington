import { createCrmListUnsubscribeHeaders } from '@services/crm-contacts'
import { createListUnsubscribeHeaders } from '@services/users'
import { EMAIL_CLASSIFICATIONS, type EmailType } from './registry.mts'

export type ClassifiedSendContext = {
  userId?: string
  crmEmail?: string
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

  if (entry.unsubscribe.scheme === 'user-category') {
    if (!ctx.userId) {
      throw new TypeError(`sendClassifiedEmail(${type}, ...) requires ctx.userId`)
    }
    return {
      headers: createListUnsubscribeHeaders(ctx.userId, entry.unsubscribe.category),
      configurationSetName,
    }
  }

  if (!ctx.crmEmail) {
    throw new TypeError(`sendClassifiedEmail(${type}, ...) requires ctx.crmEmail`)
  }
  return {
    headers: createCrmListUnsubscribeHeaders(ctx.crmEmail),
    configurationSetName,
  }
}
