import { getPricedModels, isPricedModel } from './pricing.mts'
import {
  MODEL_PROVIDERS,
  OPENAI_TRANSPORTS,
  type ModelProvider,
  type ModelSelection,
  type OpenAITransport,
} from './types.mts'

/**
 * Every model-backed service that has its own provider and model setting. The slug is the ledger's
 * `agent_slug`, so spend and settings share one name. The jev classifiers (C5, C6, C8, C9) are not
 * here: their classifier rows own their transport and model.
 */
export const MODEL_SERVICE_SLUGS = [
  'appeal-resolution',
  'autotagger-agent',
  'chat-generate-title',
  'copyright-appeal-recommendation',
  'copyright-email-intake',
  'copyright-form-screening',
  'copyright-submission-guidance',
  'dispute-resolution',
  'report-judgement',
  'story-post',
] as const
export type ModelServiceSlug = (typeof MODEL_SERVICE_SLUGS)[number]

/** Haiku is the default for every service; Anthropic usage draws first on the included credits. */
export const DEFAULT_MODEL_SELECTION: Readonly<ModelSelection> = {
  provider: 'anthropic',
  model: 'claude-haiku-5-5',
}

export const DEFAULT_OPENAI_TRANSPORT: OpenAITransport = 'openrouter'

function fieldPrefix(slug: ModelServiceSlug): string {
  return slug.replaceAll('-', '_')
}

export function providerFieldName(slug: ModelServiceSlug): string {
  return `${fieldPrefix(slug)}_provider`
}

export function modelFieldName(slug: ModelServiceSlug): string {
  return `${fieldPrefix(slug)}_model`
}

function isProvider(value: unknown): value is ModelProvider {
  return MODEL_PROVIDERS.includes(value as ModelProvider)
}

/**
 * Why a `{ provider, model }` cannot be saved, or null when it can. The model must belong to its
 * provider and have a price row: an unpriced model would record unpriced usage, which the daily
 * spend cap treats as a breach and parks every agent job.
 */
export function describeInvalidModelSelection(provider: unknown, model: unknown): string | null {
  if (!isProvider(provider)) return `provider must be one of ${MODEL_PROVIDERS.join(', ')}`
  if (typeof model !== 'string' || !isPricedModel(provider, model))
    return `model must be a priced ${provider} model (${getPricedModels(provider).join(', ')})`
  return null
}

export function describeInvalidOpenAITransport(value: unknown): string | null {
  return OPENAI_TRANSPORTS.includes(value as OpenAITransport)
    ? null
    : `openai_transport must be one of ${OPENAI_TRANSPORTS.join(', ')}`
}
