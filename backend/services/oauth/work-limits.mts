import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  authorization_exchange_recovery_batch_size: 500,
}

/** Hard ceilings for the OAuth authorization exchange recovery dispatcher. */
export const oauthAuthorizationExchangeWorkMaxValues = {
  authorization_exchange_recovery_batch_size: 5000,
}

export const oauthAuthorizationExchangeWorkConfig = new DynamicConfig({
  key: 'oauth-authorization-exchange-work-config',
  fieldTypes: {
    authorization_exchange_recovery_batch_size: 'number',
  },
  defaultFields,
})

export function getOAuthAuthorizationExchangeWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(oauthAuthorizationExchangeWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: oauthAuthorizationExchangeWorkMaxValues[field],
  })
}
