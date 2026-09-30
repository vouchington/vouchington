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
  baseline: boolean
}

export const MODERATOR_CONFIGS: ModeratorConfig[] = [
  {
    slug: 'self-promotion',
    prompt: selfPromotionPrompt,
    baseline: false,
  },
  {
    slug: 'marketplace',
    prompt: marketplacePrompt,
    baseline: false,
  },
  {
    slug: 'ai-generated',
    prompt: aiGeneratedPrompt,
    baseline: true,
  },
  {
    slug: 'politics-averse',
    prompt: politicsAversePrompt,
    baseline: false,
  },
  {
    slug: 'click-bait',
    prompt: clickBaitPrompt,
    baseline: false,
  },
  {
    slug: 'vague-post',
    prompt: vaguePostPrompt,
    baseline: false,
  },
  {
    slug: 'shit-post',
    prompt: shitPostPrompt,
    baseline: false,
  },
]

export function isBaselineModeratorSlug(slug: string): boolean {
  return MODERATOR_CONFIGS.some(c => c.slug === slug && c.baseline)
}
