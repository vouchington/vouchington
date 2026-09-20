import type { DynamicConfigFieldMetadataByName } from './registry-descriptor.mts'

export const SCORE_MAX_EXEMPTION =
  'Net-score thresholds may span the current scoring model range; ordering validators enforce safe relationships.'
export const RATE_LIMIT_MAX_EXEMPTION =
  'Rate-limit ceilings intentionally remain operator-tunable; validators enforce positive finite numbers.'
export const VOTE_WEIGHT_MAX_EXEMPTION =
  'Vote-weight multipliers are operator policy values; ordering and positive-number validators constrain invalid edits.'
export const TAG_LIMIT_MAX_EXEMPTION =
  'Tag-add and autotagger topic caps are operator policy values with no natural ceiling; validators enforce non-negative integers.'

export function scoreField(description: string) {
  return { description, max_value_exemption: SCORE_MAX_EXEMPTION }
}

export function withMaxValueExemption<T extends DynamicConfigFieldMetadataByName>(
  fields: T,
  reason: string,
  except: readonly string[] = [],
): T {
  return Object.fromEntries(
    Object.entries(fields).map(([name, metadata]) => [
      name,
      metadata.max_value === undefined && !except.includes(name)
        ? { ...metadata, max_value_exemption: reason }
        : metadata,
    ]),
  ) as T
}
