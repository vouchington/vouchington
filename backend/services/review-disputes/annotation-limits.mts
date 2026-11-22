import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const disputeAnnotationsMaxValues = { max_batch_post_ids: 50 } as const

export const disputeAnnotationsConfig = new DynamicConfig({
  key: 'dispute-annotations-config',
  fieldTypes: { max_batch_post_ids: 'number' },
  defaultFields: disputeAnnotationsMaxValues,
})

export function getDisputeAnnotationPostLimit(): number {
  return getBoundedPositiveIntegerField(disputeAnnotationsConfig, 'max_batch_post_ids', {
    defaultValue: disputeAnnotationsMaxValues.max_batch_post_ids,
    maxValue: disputeAnnotationsMaxValues.max_batch_post_ids,
  })
}
