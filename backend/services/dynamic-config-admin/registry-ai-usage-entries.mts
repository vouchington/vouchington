import {
  SPEND_CAP_MAX_VALUES,
  SPEND_CAP_MIN_VALUES,
  spendCapConfig,
} from '@services/ai-usage/spend-cap-config'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'
import { modelRoutingRegistryEntry } from './registry-model-routing-entry.mts'

export const aiUsageDynamicConfigRegistryEntries = [
  defineDynamicConfigNamespace({
    namespace: 'ai-spend-cap',
    label: 'AI Spend Cap',
    description: 'Daily all-agents AI spend ceiling, enforced on every billed provider call site.',
    config: spendCapConfig,
    access: { update_roles: ['developer'] },
    fields: {
      enabled: {
        description:
          'Enforce the best-effort daily spend cap using recorded priced usage. When false, spend is not capped.',
      },
      daily_cap_microunits: {
        description:
          'Maximum recorded priced AI provider cost across all agents per UTC day, in scale-six USD microunits (1,000,000 = $1). Calls are blocked only when the known total exceeds this value; unavailable or unpriced usage does not close the gate. While breached, marked ai_agents jobs park until UTC midnight while a limiter-independent coordinator rechecks every minute (other queued jobs are unaffected), and synchronous non-queue provider calls return 429. Raising the cap releases a breach. The daily total resets at UTC midnight.',
        minValue: SPEND_CAP_MIN_VALUES.daily_cap_microunits,
        maxValue: SPEND_CAP_MAX_VALUES.daily_cap_microunits,
        integer: true,
      },
    },
  }),
  modelRoutingRegistryEntry,
]
