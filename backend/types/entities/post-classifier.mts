import {
  clickBaitPolicy,
  marketplacePolicy,
  politicsAversePolicy,
  selfPromotionPolicy,
  shitPostPolicy,
  vaguePostPolicy,
} from './moderator-prompts.mts'
import { POST_CLASSIFIER_SYSTEM_USERNAME } from './user-constants.mts'
import type { ClassifierModelProvider } from './classifier.mts'

export const POST_CLASSIFIER_SLUG = POST_CLASSIFIER_SYSTEM_USERNAME
export const POST_CLASSIFIER_MODEL_NAME = 'typesafe/jev-1.13'
export const POST_CLASSIFIER_MODEL_PROVIDER = 'openrouter' satisfies ClassifierModelProvider
export const POST_CLASSIFIER_ACTION_POLICY_REVISION = '1'
export const POST_CLASSIFIER_LOCAL_POLICY_REVISION = '1'

type RemoteCandidate = { topicSlug: string; questionId: `topic:${string}`; question: string }
type RemoteLabel = {
  slug: string
  kind: 'remote'
  candidates: readonly RemoteCandidate[]
  topicSlug?: never
}
type LocalLabel = {
  slug: 'ai-generated'
  kind: 'local'
  topicSlug: 'ai-generated'
  candidates?: never
}

export const POST_CLASSIFIER_LABELS = [
  {
    slug: 'self-promotion',
    kind: 'remote',
    candidates: [
      {
        topicSlug: 'self-promotion',
        questionId: 'topic:self-promotion',
        question:
          "Does the post promote the author's own company, product, service, referral, affiliate link, publication, or social channel?",
      },
    ],
  },
  {
    slug: 'marketplace',
    kind: 'remote',
    candidates: [
      {
        topicSlug: 'buying',
        questionId: 'topic:buying',
        question:
          'Is the author trying to buy points, miles, gift cards, vouchers, or travel services?',
      },
      {
        topicSlug: 'selling',
        questionId: 'topic:selling',
        question:
          'Is the author offering to sell points, miles, gift cards, vouchers, or travel services?',
      },
      {
        topicSlug: 'trade',
        questionId: 'topic:trade',
        question:
          'Is the author proposing to trade or swap points, miles, benefits, or similar items?',
      },
      {
        topicSlug: 'for-hire',
        questionId: 'topic:for-hire',
        question:
          'Is the author offering their own travel booking, consulting, or related services for hire?',
      },
      {
        topicSlug: 'hiring',
        questionId: 'topic:hiring',
        question:
          'Is the author seeking to hire someone for travel booking, consulting, or related services?',
      },
    ],
  },
  { slug: 'ai-generated', kind: 'local', topicSlug: 'ai-generated' },
  {
    slug: 'politics-averse',
    kind: 'remote',
    candidates: [
      {
        topicSlug: 'political',
        questionId: 'topic:political',
        question:
          'Does the post advocate a partisan political position, promote a campaign, or present an unsupported political claim as fact?',
      },
    ],
  },
  {
    slug: 'click-bait',
    kind: 'remote',
    candidates: [
      {
        topicSlug: 'click-bait',
        questionId: 'topic:click-bait',
        question: 'Does the post use intentionally misleading framing or captions to earn clicks?',
      },
    ],
  },
  {
    slug: 'vague-post',
    kind: 'remote',
    candidates: [
      {
        topicSlug: 'vague-post',
        questionId: 'topic:vague-post',
        question: 'Is the post too vague to be useful because it lacks essential context?',
      },
    ],
  },
  {
    slug: 'shit-post',
    kind: 'remote',
    candidates: [
      {
        topicSlug: 'shit-post',
        questionId: 'topic:shit-post',
        question:
          'Is the post low-effort noise, bait, a joke, rant, or meme without useful substance?',
      },
    ],
  },
] as const satisfies readonly (RemoteLabel | LocalLabel)[]

export type PostClassifierLabel = (typeof POST_CLASSIFIER_LABELS)[number]
export type PostClassifierLogicalSlug = PostClassifierLabel['slug']

export const POST_CLASSIFIER_REMOTE_QUESTIONS = POST_CLASSIFIER_LABELS.flatMap(label =>
  label.kind === 'remote'
    ? label.candidates.map(candidate => ({ logicalSlug: label.slug, ...candidate }))
    : [],
)

export const POST_CLASSIFIER_POLICY_PROMPT = [
  'Classify each requested topic independently. Apply the relevant policy below to the post state.',
  `Self-promotion:\n${selfPromotionPolicy}`,
  `Marketplace:\n${marketplacePolicy}`,
  `Political content:\n${politicsAversePolicy}`,
  `Click bait:\n${clickBaitPolicy}`,
  `Vague posts:\n${vaguePostPolicy}`,
  `Low-effort posts:\n${shitPostPolicy}`,
].join('\n\n')

export const POST_CLASSIFIER_PROMPT = [
  POST_CLASSIFIER_POLICY_PROMPT,
  'Ordered Noul questions (answer each independently):',
  ...POST_CLASSIFIER_REMOTE_QUESTIONS.map(
    ({ questionId, question }) => `${questionId}: ${question}`,
  ),
].join('\n\n')
