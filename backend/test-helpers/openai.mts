import type { OpenAI } from '@modules/openai-utils'

type ModerationCategories = OpenAI.Moderations.Moderation['categories']

function createModerationCategories(
  flaggedCategories: Partial<ModerationCategories>,
): ModerationCategories {
  return {
    harassment: false,
    'harassment/threatening': false,
    hate: false,
    'hate/threatening': false,
    illicit: false,
    'illicit/violent': false,
    'self-harm': false,
    'self-harm/instructions': false,
    'self-harm/intent': false,
    sexual: false,
    'sexual/minors': false,
    violence: false,
    'violence/graphic': false,
    ...flaggedCategories,
  }
}

function createCategoryAppliedInputTypes(): OpenAI.Moderations.Moderation['category_applied_input_types'] {
  return {
    harassment: [],
    'harassment/threatening': [],
    hate: [],
    'hate/threatening': [],
    illicit: [],
    'illicit/violent': [],
    'self-harm': [],
    'self-harm/instructions': [],
    'self-harm/intent': [],
    sexual: [],
    'sexual/minors': [],
    violence: [],
    'violence/graphic': [],
  }
}

function createCategoryScores(): OpenAI.Moderations.Moderation['category_scores'] {
  return {
    harassment: 0,
    'harassment/threatening': 0,
    hate: 0,
    'hate/threatening': 0,
    illicit: 0,
    'illicit/violent': 0,
    'self-harm': 0,
    'self-harm/instructions': 0,
    'self-harm/intent': 0,
    sexual: 0,
    'sexual/minors': 0,
    violence: 0,
    'violence/graphic': 0,
  }
}

export function createOpenAIModerationResponse(
  flagged = false,
  flaggedCategories: Partial<ModerationCategories> = {},
): OpenAI.Moderations.ModerationCreateResponse {
  const categories = createModerationCategories(flaggedCategories)
  return {
    id: 'mod_test',
    model: 'omni-moderation-latest',
    results: [
      {
        flagged,
        categories,
        category_applied_input_types: createCategoryAppliedInputTypes(),
        category_scores: createCategoryScores(),
      },
    ],
  }
}
