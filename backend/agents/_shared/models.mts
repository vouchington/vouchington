import type { OpenAIPricedModel } from '@modules/model-providers/pricing-table'

/**
 * The default OpenAI model used by every agent in this codebase.
 * Bumping the model name here propagates to all agents that don't override it.
 * Per-agent overrides remain valid for cases where a different model is required.
 * Typed against `OpenAIPricedModel` so bumping this to a model missing from the pricing table
 * (pricing.mts) fails typecheck instead of shipping an unpriced default silently.
 */
export const DEFAULT_AGENT_MODEL: OpenAIPricedModel = 'gpt-5.4-nano'
