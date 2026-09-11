import { DynamicConfig } from '@data-stores/valkey'

export const OPENAI_SPEND_CAP_CONFIG_KEY = 'openai-spend-cap'

export type OpenAiSpendCapNumberField = 'daily_cap_microunits'

// `enabled: false` is NOT a kill switch -- it disables cap enforcement entirely, permitting
// unlimited spend (`processAIAgentWorkerJob` skips the check when disabled). The true zero-spend
// kill switch is `daily_cap_microunits: 0`: `totalMicrounits >= 0` is always true (totals are
// non-negative), so the very first job of the day breaches and every subsequent job defers. The
// floor is therefore 0, not a small positive number -- a nonzero-but-tiny cap (e.g. $0.10/day)
// cannot provide a real full stop anyway, since the first admitted call can itself cost more than
// the floor.
export const OPENAI_SPEND_CAP_MIN_VALUES: Record<OpenAiSpendCapNumberField, number> = {
  daily_cap_microunits: 0,
}

// $1,000,000/day ceiling -- generous headroom while still bounding the admin-editable field.
export const OPENAI_SPEND_CAP_MAX_VALUES: Record<OpenAiSpendCapNumberField, number> = {
  daily_cap_microunits: 1_000_000_000_000,
}

// DynamicConfig over an env var deliberately: the point of a spend cap is lowering it *now*,
// without a deploy. $10/day default in scale-six USD microunits (MONEY_SCALE, @ts-shared/money) --
// conservative headroom over the modeled ~$77/month (~$2.60/day) production forecast (see
// docs/overview/architecture/openai-cost-model.md), well under the ~$2,160/month OPENAI_TPM
// structurally permits today.
//
// This figure is a pre-launch estimate, not a measurement against real billing (#8773: production
// has never deployed, so there is no billing cycle to measure against yet). Deliberately shipped
// now rather than gated on one -- recalibrate via the admin UI (no deploy needed) once real traffic
// and OpenAI invoices exist to check it against.
export const openAiSpendCapConfig = new DynamicConfig({
  key: OPENAI_SPEND_CAP_CONFIG_KEY,
  fieldTypes: {
    enabled: 'boolean',
    daily_cap_microunits: 'number',
  },
  defaultFields: {
    enabled: true,
    daily_cap_microunits: 10_000_000,
  },
})

export function getOpenAiSpendCapFields(): {
  enabled: boolean
  daily_cap_microunits: number
} {
  const fields = openAiSpendCapConfig.getFields()
  return {
    enabled: (fields['enabled'] as boolean | undefined) ?? true,
    daily_cap_microunits: (fields['daily_cap_microunits'] as number | undefined) ?? 10_000_000,
  }
}
