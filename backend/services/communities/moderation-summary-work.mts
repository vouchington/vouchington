import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = { membership_page_size: 10, source_page_size: 25 }
export const moderationSummaryWorkMaxValues = {
  membership_page_size: 100,
  source_page_size: 100,
}
export const moderationSummaryWorkConfig = new DynamicConfig({
  key: 'moderation-summary-work-config',
  fieldTypes: { membership_page_size: 'number', source_page_size: 'number' },
  defaultFields,
})
export function getModerationSummaryWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(moderationSummaryWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: moderationSummaryWorkMaxValues[field],
  })
}
