import { DynamicConfig } from '@data-stores/valkey'

export const SPEND_CAP_CONFIG_KEY = 'ai-spend-cap'

export type SpendCapNumberField = 'daily_cap_microunits'

// `enabled: false` disables cap enforcement entirely. A zero cap admits calls until some
// priced spend is recorded, then blocks while the known total remains positive.
export const SPEND_CAP_MIN_VALUES: Record<SpendCapNumberField, number> = {
  daily_cap_microunits: 0,
}

// $1,000,000/day ceiling -- generous headroom while still bounding the admin-editable field.
export const SPEND_CAP_MAX_VALUES: Record<SpendCapNumberField, number> = {
  daily_cap_microunits: 1_000_000_000_000,
}

// DynamicConfig over an env var deliberately: the point of a spend cap is lowering it *now*,
// without a deploy. default is in scale-six USD microunits (MONEY_SCALE, @ts-shared/money).
//
// This figure is a pre-launch estimate, not a measurement against real billing (#8773: production
// has never deployed, so there is no billing cycle to measure against yet). Deliberately shipped
// now rather than gated on one -- recalibrate via the admin UI (no deploy needed) once real traffic
// and OpenAI invoices exist to check it against.
export const spendCapConfig = new DynamicConfig({
  key: SPEND_CAP_CONFIG_KEY,
  fieldTypes: {
    enabled: 'boolean',
    daily_cap_microunits: 'number',
  },
  defaultFields: {
    enabled: true,
    daily_cap_microunits: 10_000_000,
  },
})

export function getSpendCapFields(): {
  enabled: boolean
  daily_cap_microunits: number
} {
  const fields = spendCapConfig.getFields()
  return {
    enabled: (fields['enabled'] as boolean | undefined) ?? true,
    daily_cap_microunits: (fields['daily_cap_microunits'] as number | undefined) ?? 10_000_000,
  }
}
