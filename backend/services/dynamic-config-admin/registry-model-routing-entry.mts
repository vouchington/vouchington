import {
  MODEL_SERVICE_SLUGS,
  modelFieldName,
  providerFieldName,
} from '@modules/model-providers/routing'
import { modelRoutingConfig } from '@services/ai-usage/model-routing-config'
import { validateModelRoutingConfig } from './registry-ai-usage-validators.mts'
import { defineDynamicConfigNamespace } from './registry-descriptor.mts'
import type { DynamicConfigRegistryEntry } from './types.mts'

const serviceFields = Object.fromEntries(
  MODEL_SERVICE_SLUGS.flatMap(slug => [
    [
      providerFieldName(slug),
      {
        description: `Provider that runs ${slug}: anthropic or openai. Switch services to openai when Anthropic's included credits run out; there is no automatic fallback.`,
      },
    ],
    [
      modelFieldName(slug),
      {
        description: `Model that runs ${slug}. It must belong to the provider above and have a price row, or saving is rejected.`,
      },
    ],
  ]),
)

export const modelRoutingRegistryEntry: DynamicConfigRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'ai-model-routing',
  label: 'AI Model Routing',
  description:
    'Which provider and model each model-backed service runs on, and which endpoint serves OpenAI. Takes effect without a deploy.',
  config: modelRoutingConfig,
  access: { update_roles: ['developer'] },
  fields: {
    openai_transport: {
      description:
        'How OpenAI calls reach OpenAI for every service: openrouter (OpenRouter) or direct (OpenAI directly, with background mode and its reconciler).',
    },
    ...serviceFields,
  },
  validate: validateModelRoutingConfig,
})
