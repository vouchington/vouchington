import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = { rewrite_attempts: 3 }

export const canonicalWorkMaxValues = { rewrite_attempts: 5 }

export const canonicalWorkConfig = new DynamicConfig({
  key: 'url-canonicalization-work-config',
  fieldTypes: { rewrite_attempts: 'number' },
  defaultFields,
})

export function getCanonicalRewriteAttempts(): number {
  return getBoundedPositiveIntegerField(canonicalWorkConfig, 'rewrite_attempts', {
    defaultValue: defaultFields.rewrite_attempts,
    maxValue: canonicalWorkMaxValues.rewrite_attempts,
  })
}
