import { classifierCandidateKey } from '@agents/classifiers/bindings'
import {
  classifierChoiceKey,
  classifierStructuralText,
  joinClassifierSafeText,
  renderClassifierChoiceQuestion,
  sanitizeClassifierExternalContentParts,
  type ClassifierExternalContentPart,
  type ClassifierSafeText,
} from '@agents/classifiers/safe-content'
import type {
  ChoiceClassifierBinding,
  ChoiceClassifierCriterion,
  ClassifierDecisionCandidate,
} from '@agents/classifiers/types'
import { firstVisibleRssTextField } from '@modules/utils'
import type { StoryRunCandidate } from '@services/classifier-runs'
import type { ViewRssFeedItem } from '@services/rss-feed-items/types'

/** The single Choice question one story-clustering decision asks: one call, one question. */
export const STORY_CLUSTERING_QUESTION_ID = 'story-clustering'

/**
 * The criterion for "belongs to none of the labeled candidates". It is never bound to a candidate
 * and never produces a result row, so the selection infers it by the absence of a qualifying one.
 */
export const STORY_CLUSTERING_NONE_KEY = classifierChoiceKey('none')

/** One reserved candidate and the item whose content stands in for it in the prompt. */
export type StoryClusteringPromptCandidate = {
  candidate: StoryRunCandidate
  /** Null when the representative is gone: the block then carries only its structural lines. */
  item: ViewRssFeedItem | null
  /** The story's own `published_at`, used when no representative item is left to date it. */
  storyPublishedAt: Date | null
}

type StoryClusteringBindingsInput = {
  incomingItem: ViewRssFeedItem
  /** One entry per reserved candidate, in capture order; the decision must cover exactly these. */
  candidates: readonly StoryClusteringPromptCandidate[]
  /** The classifier's prompt template verbatim; a Choice question has no placeholder to fill. */
  promptTemplate: string
}

export type StoryClusteringBindings = {
  bindings: readonly [ChoiceClassifierBinding]
  state: ClassifierSafeText
}

function toDecisionCandidate(candidate: StoryRunCandidate): ClassifierDecisionCandidate {
  return candidate.kind === 'story'
    ? { candidateKind: 'story', storyId: candidate.storyId, storedCandidateId: null }
    : {
        candidateKind: 'rss_feed_item',
        rssFeedItemId: candidate.rssFeedItemId,
        storedCandidateId: null,
      }
}

/** Trusted structural lines only: ids, criterion keys and timestamps, never feed-supplied text. */
function structuralBlock(lines: readonly string[]): ClassifierSafeText {
  return classifierStructuralText(lines.map(line => `${line}\n`).join(''))
}

/** The item's own feed title, title and description, sanitized and wrapped as external content. */
async function sanitizedItemContent(item: ViewRssFeedItem): Promise<ClassifierSafeText> {
  const description = firstVisibleRssTextField([
    item.data.description,
    item.data['media:description'],
  ])
  const parts: (ClassifierExternalContentPart | null)[] = [
    item.rss_feed.title ? { content: item.rss_feed.title, isTitle: true } : null,
    item.data.title ? { content: item.data.title, isTitle: true } : null,
    description ? { content: description, isRssHtml: true } : null,
  ]
  return sanitizeClassifierExternalContentParts(
    parts.filter((part): part is ClassifierExternalContentPart => part !== null),
    '\n',
    { source: 'rss_feed_item', contentType: 'article' },
  )
}

async function describeIncomingItem(item: ViewRssFeedItem): Promise<ClassifierSafeText> {
  const structural = structuralBlock([
    'Incoming article',
    `Published: ${item.published_at.toISOString()}`,
  ])
  return joinClassifierSafeText([structural, await sanitizedItemContent(item)], '')
}

async function describeCandidate(
  entry: StoryClusteringPromptCandidate,
  criterion: string,
): Promise<ClassifierSafeText> {
  const published = entry.item?.published_at ?? entry.storyPublishedAt
  const lines = [`Candidate key: ${criterion}`]
  if (published) lines.push(`Published: ${published.toISOString()}`)
  if (entry.candidate.kind === 'story') lines.push(`Existing story: ${entry.candidate.storyId}`)
  if (!entry.item) {
    lines.push('Content unavailable')
    return structuralBlock(lines)
  }
  return joinClassifierSafeText(
    [structuralBlock(lines), await sanitizedItemContent(entry.item)],
    '',
  )
}

/**
 * Builds the one Choice binding and its state for a story-clustering decision: one bound criterion
 * per reserved candidate (an existing story's nearest member or a standalone item) plus the unbound
 * `none` criterion, and a state describing the incoming article followed by every candidate. Every
 * reserved candidate is rendered, with a structural-only block when its content is gone, because
 * the persisted decision must cover exactly the candidates the receipt reserved.
 */
export async function buildStoryClusteringBindings(
  input: StoryClusteringBindingsInput,
): Promise<StoryClusteringBindings> {
  if (input.candidates.length === 0) {
    throw new Error('Story clustering requires at least one candidate to build a Choice decision')
  }
  const entries = input.candidates.map(entry => {
    const decisionCandidate = toDecisionCandidate(entry.candidate)
    return {
      entry,
      decisionCandidate,
      criterion: classifierChoiceKey(classifierCandidateKey(decisionCandidate)),
    }
  })
  const [incomingBlock, ...candidateBlocks] = await Promise.all([
    describeIncomingItem(input.incomingItem),
    ...entries.map(({ entry, criterion }) => describeCandidate(entry, criterion)),
  ])
  const criteria: ChoiceClassifierCriterion[] = entries.map(({ decisionCandidate, criterion }) => ({
    criterion,
    candidate: decisionCandidate,
  }))
  criteria.push({ criterion: STORY_CLUSTERING_NONE_KEY, candidate: null })
  return {
    bindings: [
      {
        type: 'choice',
        questionId: STORY_CLUSTERING_QUESTION_ID,
        question: renderClassifierChoiceQuestion(input.promptTemplate),
        criteria,
      },
    ],
    state: joinClassifierSafeText([incomingBlock!, ...candidateBlocks], '\n\n---\n\n'),
  }
}
