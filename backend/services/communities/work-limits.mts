import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  embedded_first_posts_chunk_size: 1000,
  recovery_page_size: 100,
  summary_email_batch_size: 250,
}

/** Hard ceilings for the current runtime configuration contract. */
export const communitiesWorkMaxValues = {
  embedded_first_posts_chunk_size: 10000,
  recovery_page_size: 1000,
  summary_email_batch_size: 2500,
}

export const communitiesWorkConfig = new DynamicConfig({
  key: 'communities-work-config',
  fieldTypes: {
    embedded_first_posts_chunk_size: 'number',
    recovery_page_size: 'number',
    summary_email_batch_size: 'number',
  },
  defaultFields,
})

export function getCommunitiesWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(communitiesWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: communitiesWorkMaxValues[field],
  })
}
