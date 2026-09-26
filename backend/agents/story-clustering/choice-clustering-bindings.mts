import { firstVisibleRssTextField } from '@modules/utils'
import type { ViewRssFeedItem } from '@services/rss-feed-items/types'
import type { StoryClusterCandidateRow } from '@voucha/types/entities/story'
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
  RssFeedItemClassifierCandidate,
  StoryClassifierCandidate,
} from '@agents/classifiers/types'

/** The single Choice question this classifier ever asks per decision (one call, one question). */
export const STORY_CLUSTERING_QUESTION_ID = 'story-clustering'

/** The Choice criterion key for "does not belong to any labeled candidate". Never bound to a
 * candidate, and (per `choiceResults`, backend/agents/classifiers/results.mts) never produces a
 * persisted result row -- `selectStoryClusteringOutcome` infers it by absence. */
export const STORY_CLUSTERING_NONE_KEY = classifierChoiceKey('none')

export type StoryClusteringCandidateContent = {
  /** The nearest-neighbor row this content was fetched for (`story_id` null for a standalone item). */
  candidate: StoryClusterCandidateRow
  /** That row's own RSS feed item -- always the item named by `candidate.id`. */
  item: ViewRssFeedItem
}

export type StoryClusteringBindingsInput = {
  incomingItem: ViewRssFeedItem
  /** Already deduped (`dedupeStoryClusterCandidates`) and already fetched by the caller -- this
   * module is pure and does no DB I/O of its own. */
  candidateContent: readonly StoryClusteringCandidateContent[]
  /** The active classifier configuration's prompt template, verbatim (see
   * 0730-00-02-seed-story-clustering-classifier.mts for why it has no placeholder to render). */
  promptTemplate: string
}

export type StoryClusteringBindings = {
  bindings: readonly [ChoiceClassifierBinding]
  state: ClassifierSafeText
}

function candidateEntity(
  row: StoryClusterCandidateRow,
): StoryClassifierCandidate | RssFeedItemClassifierCandidate {
  return row.story_id
    ? { candidateKind: 'story', storyId: row.story_id, storedCandidateId: null }
    : { candidateKind: 'rss_feed_item', rssFeedItemId: row.id, storedCandidateId: null }
}

/**
 * Describes one RSS feed item as a `state` content block: trusted structural lines (a label the
 * model correlates back to a Choice criterion key, plus `Published`/`Existing story` metadata) via
 * `classifierStructuralText`, joined with one sanitized block covering the item's own
 * feed-name/title/description fields. Deliberately simpler than the retired agentic clustering
 * agent's per-field-labeled format (`Source:`/`Title:`/`Description:` each individually labeled):
 * `sanitizeClassifierExternalContentParts` joins its sanitized parts without preserving individual
 * labels, so this only distinguishes the title part (`isTitle: true`) and routes the description
 * through the RSS-HTML-aware sanitizer (`isRssHtml: true`).
 */
async function describeRssFeedItem(
  item: ViewRssFeedItem,
  structuralLines: readonly string[],
): Promise<ClassifierSafeText> {
  const structural = classifierStructuralText(structuralLines.map(line => `${line}\n`).join(''))
  const description = firstVisibleRssTextField([
    item.data.description,
    item.data['media:description'],
  ])
  const parts: (ClassifierExternalContentPart | null)[] = [
    item.rss_feed.title ? { content: item.rss_feed.title, isTitle: true } : null,
    item.data.title ? { content: item.data.title, isTitle: true } : null,
    description ? { content: description, isRssHtml: true } : null,
  ]
  const filteredParts = parts.filter((part): part is ClassifierExternalContentPart => part !== null)
  const sanitizedContent = await sanitizeClassifierExternalContentParts(filteredParts, '\n', {
    source: 'rss_feed_item',
    contentType: 'article',
  })
  return joinClassifierSafeText([structural, sanitizedContent], '')
}

/**
 * Builds the one Choice binding and its `state` for a story-clustering decision: one bound
 * criterion per candidate (an existing story's nearest member, or a standalone item) plus the
 * always-present unbound `none` criterion, and a `state` describing the incoming item followed by
 * every candidate's own content block. Throws if given no candidates -- the caller
 * (`choice-clustering.mts`) must never dispatch a decision with nothing to choose between; an empty
 * candidate search is a `null` (no dispatch) outcome, not a call into this function.
 */
export async function buildStoryClusteringBindings(
  input: StoryClusteringBindingsInput,
): Promise<StoryClusteringBindings> {
  if (input.candidateContent.length === 0) {
    throw new Error('Story clustering requires at least one candidate to build a Choice decision')
  }

  const question = renderClassifierChoiceQuestion(input.promptTemplate)

  const incomingBlockPromise = describeRssFeedItem(input.incomingItem, [
    'Incoming article',
    `Published: ${input.incomingItem.published_at.toISOString()}`,
  ])

  const candidateEntries = input.candidateContent.map(({ candidate: row, item }) => {
    const entity = candidateEntity(row)
    const criterion = classifierChoiceKey(classifierCandidateKey(entity))
    const structuralLines = [
      `Candidate key: ${criterion}`,
      `Published: ${item.published_at.toISOString()}`,
    ]
    if (row.story_id) structuralLines.push(`Existing story: ${row.story_id}`)
    return { entity, criterion, blockPromise: describeRssFeedItem(item, structuralLines) }
  })

  const [incomingBlock, ...candidateBlocks] = await Promise.all([
    incomingBlockPromise,
    ...candidateEntries.map(entry => entry.blockPromise),
  ])

  const criteria: ChoiceClassifierCriterion[] = candidateEntries.map(entry => ({
    criterion: entry.criterion,
    candidate: entry.entity,
  }))
  criteria.push({ criterion: STORY_CLUSTERING_NONE_KEY, candidate: null })

  const state = joinClassifierSafeText([incomingBlock!, ...candidateBlocks], '\n\n---\n\n')

  return {
    bindings: [{ type: 'choice', questionId: STORY_CLUSTERING_QUESTION_ID, question, criteria }],
    state,
  }
}
