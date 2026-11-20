import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  post_moderations_per_post: 10,
}

/** Hard ceilings for the current runtime configuration contract. */
export const moderationWorkMaxValues = {
  post_moderations_per_post: 100,
}

export const moderationWorkConfig = new DynamicConfig({
  key: 'moderation-work-config',
  fieldTypes: {
    post_moderations_per_post: 'number',
  },
  defaultFields,
})

export function getModerationWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(moderationWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: moderationWorkMaxValues[field],
  })
}
