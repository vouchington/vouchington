import { DynamicConfig } from '@data-stores/valkey'
import {
  DEFAULT_MODEL_SELECTION,
  DEFAULT_OPENAI_TRANSPORT,
  MODEL_SERVICE_SLUGS,
  modelFieldName,
  providerFieldName,
  type ModelServiceSlug,
} from '@modules/model-providers/routing'
import type { ModelProvider, ModelSelection, OpenAITransport } from '@modules/model-providers/types'

export const MODEL_ROUTING_CONFIG_KEY = 'ai-model-routing'
export const OPENAI_TRANSPORT_FIELD = 'openai_transport'

type FieldType = 'string'

const fieldTypes: Record<string, FieldType> = { [OPENAI_TRANSPORT_FIELD]: 'string' }
const defaultFields: Record<string, string> = {
  [OPENAI_TRANSPORT_FIELD]: DEFAULT_OPENAI_TRANSPORT,
}
for (const slug of MODEL_SERVICE_SLUGS) {
  fieldTypes[providerFieldName(slug)] = 'string'
  fieldTypes[modelFieldName(slug)] = 'string'
  defaultFields[providerFieldName(slug)] = DEFAULT_MODEL_SELECTION.provider
  defaultFields[modelFieldName(slug)] = DEFAULT_MODEL_SELECTION.model
}

/**
 * Which provider and model each model-backed service runs on, and which endpoint serves OpenAI.
 * A DynamicConfig so an operator can switch a service (for example away from Anthropic when its
 * credits run out) without a deploy. The worker or request handler reads a service's setting and
 * passes it to the agent; agents have no hidden default.
 */
export const modelRoutingConfig = new DynamicConfig({
  key: MODEL_ROUTING_CONFIG_KEY,
  fieldTypes,
  defaultFields,
})

/**
 * The stored pair. Saving validates it (see the registry validator): the provider must own the
 * model and the model must have a price row, so a read never needs to repair a selection.
 */
export function getServiceModelSelection(slug: ModelServiceSlug): ModelSelection {
  const fields = modelRoutingConfig.getFields()
  return {
    provider: fields[providerFieldName(slug)] as ModelProvider,
    model: fields[modelFieldName(slug)] as string,
  }
}

export function getOpenAITransport(): OpenAITransport {
  return modelRoutingConfig.getFields()[OPENAI_TRANSPORT_FIELD] as OpenAITransport
}

/**
 * The service's selection once the setting has loaded. A worker or request handler reads it here
 * and passes it to the agent, so a switch in the setting applies to the next call without a deploy.
 */
export async function loadServiceModelSelection(slug: ModelServiceSlug): Promise<ModelSelection> {
  await modelRoutingConfig.waitForInitialization()
  return getServiceModelSelection(slug)
}
