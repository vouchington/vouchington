import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  crawl_effect_page_size: 100,
  post_related_url_projection_page_size: 100,
}

/** Hard ceilings for the current runtime configuration contract. */
export const storiesWorkMaxValues = {
  crawl_effect_page_size: 1000,
  post_related_url_projection_page_size: 1000,
}

export const storiesWorkConfig = new DynamicConfig({
  key: 'stories-work-config',
  fieldTypes: {
    crawl_effect_page_size: 'number',
    post_related_url_projection_page_size: 'number',
  },
  defaultFields,
})

export function getStoriesWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(storiesWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: storiesWorkMaxValues[field],
  })
}
