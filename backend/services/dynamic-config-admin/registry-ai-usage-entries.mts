import {
  OPENAI_SPEND_CAP_MAX_VALUES,
  OPENAI_SPEND_CAP_MIN_VALUES,
  openAiSpendCapConfig,
} from '@services/ai-usage/spend-cap-config'
import { validateOpenAiSpendCapConfig } from './registry-ai-usage-validators.mts'
import { defineDynamicConfigNamespace } from './registry-descriptor.mts'

export const aiUsageDynamicConfigRegistryEntries = [
  defineDynamicConfigNamespace({
    namespace: 'openai-spend-cap',
    label: 'OpenAI Spend Cap',
    description:
      'Daily all-agents OpenAI spend ceiling, enforced on every billed OpenAI call site.',
    config: openAiSpendCapConfig,
    access: { update_roles: ['developer'] },
    fields: {
      enabled: {
        description:
          'Enforce the daily spend cap. When false, nothing rate-limits on spend -- this is NOT a kill switch, it disables enforcement. To stop new spend immediately, set daily_cap_microunits to 0 instead.',
      },
      daily_cap_microunits: {
        description:
          'Maximum total OpenAI cost across all agents per UTC day, in scale-six USD microunits (1,000,000 = $1). Set to 0 for a true zero-spend kill switch. While breached, marked ai_agents jobs park until UTC midnight while a limiter-independent coordinator rechecks every minute (other queued jobs are unaffected), and synchronous non-queue OpenAI calls (e.g. chat title generation, moderation test runs) return 429. Raising the cap releases a cost-total breach; disabling enforcement also releases an unpriced-row breach. The daily total resets at UTC midnight.',
        min_value: OPENAI_SPEND_CAP_MIN_VALUES.daily_cap_microunits,
        max_value: OPENAI_SPEND_CAP_MAX_VALUES.daily_cap_microunits,
        integer: true,
      },
    },
    validate: validateOpenAiSpendCapConfig,
  }),
]
