import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  email_bloom_batch_size: 10000,
  bloom_batch_size: 10000,
  blocklist_bloom_visibility_retries: 120,
}

/** Hard ceilings for the current runtime configuration contract. */
export const urlsDomainsBlacklistWorkMaxValues = {
  email_bloom_batch_size: 100000,
  bloom_batch_size: 100000,
  blocklist_bloom_visibility_retries: 1000,
}

export const urlsDomainsBlacklistWorkConfig = new DynamicConfig({
  key: 'urls-domains-blacklist-work-config',
  fieldTypes: {
    email_bloom_batch_size: 'number',
    bloom_batch_size: 'number',
    blocklist_bloom_visibility_retries: 'number',
  },
  defaultFields,
})

export function getUrlsDomainsBlacklistWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(urlsDomainsBlacklistWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: urlsDomainsBlacklistWorkMaxValues[field],
  })
}
