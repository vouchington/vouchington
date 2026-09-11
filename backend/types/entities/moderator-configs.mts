import {
  aiGeneratedPrompt,
  clickBaitPrompt,
  marketplacePrompt,
  politicsAversePrompt,
  selfPromotionPrompt,
  shitPostPrompt,
  vaguePostPrompt,
} from './moderator-prompts.mts'

type ModeratorConfig = {
  slug: string
  prompt: string
  model: 'gpt-5.4-nano'
  provider: 'openai'
  onFlagAction: 'none' | 'review_queue'
  baseline: boolean
}

export const MODERATOR_CONFIGS: ModeratorConfig[] = [
  {
    slug: 'self-promotion',
    prompt: selfPromotionPrompt,
    model: 'gpt-5.4-nano',
    provider: 'openai',
    onFlagAction: 'review_queue',
    baseline: false,
  },
  {
    slug: 'marketplace',
    prompt: marketplacePrompt,
    model: 'gpt-5.4-nano',
    provider: 'openai',
    onFlagAction: 'review_queue',
    baseline: false,
  },
  {
    slug: 'ai-generated',
    prompt: aiGeneratedPrompt,
    // model/provider are required by the schema but unused — this moderator
    // runs the local Rust is-it-slop detector and never makes an LLM call.
    model: 'gpt-5.4-nano',
    provider: 'openai',
    onFlagAction: 'review_queue',
    baseline: true,
  },
  {
    slug: 'politics-averse',
    prompt: politicsAversePrompt,
    model: 'gpt-5.4-nano',
    provider: 'openai',
    onFlagAction: 'review_queue',
    baseline: false,
  },
  {
    slug: 'click-bait',
    prompt: clickBaitPrompt,
    model: 'gpt-5.4-nano',
    provider: 'openai',
    onFlagAction: 'none',
    baseline: false,
  },
  {
    slug: 'vague-post',
    prompt: vaguePostPrompt,
    model: 'gpt-5.4-nano',
    provider: 'openai',
    onFlagAction: 'none',
    baseline: false,
  },
  {
    slug: 'shit-post',
    prompt: shitPostPrompt,
    model: 'gpt-5.4-nano',
    provider: 'openai',
    onFlagAction: 'none',
    baseline: false,
  },
]

export function isBaselineModeratorSlug(slug: string): boolean {
  return MODERATOR_CONFIGS.some(c => c.slug === slug && c.baseline)
}
