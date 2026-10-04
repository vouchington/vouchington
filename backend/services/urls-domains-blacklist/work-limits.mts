import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  email_bloom_batch_size: 10000,
  bloom_batch_size: 10000,
}

/** Hard ceilings for the current runtime configuration contract. */
export const urlsDomainsBlacklistWorkMaxValues = {
  email_bloom_batch_size: 100000,
  bloom_batch_size: 100000,
}

export const urlsDomainsBlacklistWorkConfig = new DynamicConfig({
  key: 'urls-domains-blacklist-work-config',
  fieldTypes: {
    email_bloom_batch_size: 'number',
    bloom_batch_size: 'number',
  },
  defaultFields,
})

export function getUrlsDomainsBlacklistWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(urlsDomainsBlacklistWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: urlsDomainsBlacklistWorkMaxValues[field],
  })
}
