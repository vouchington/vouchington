import type { ViewRssFeedItem } from '@services/rss-feed-items/types'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import type { StoryClusterCandidateRow as CandidateRow } from '@voucha/types/entities/story'
import { firstVisibleRssTextField } from '@modules/utils'
import pMap from 'p-map'

export interface ClusteringAgentContent {
  content: string
}

// Each candidate formats up to three sanitized fields in parallel, so keep the outer
// candidate fan-out modest while still avoiding fully sequential prompt building.
const CANDIDATE_FORMAT_CONCURRENCY = 5

async function formatItem(
  item: ViewRssFeedItem,
  label: string,
  story_id: string | null,
): Promise<string> {
  const parts: string[] = [`${label} ID: ${item.id}`]

  const [sanitizedSource, sanitizedTitle, sanitizedDescription] = await Promise.all([
    item.rss_feed?.title ? sanitizePromptInjection(item.rss_feed.title, { isTitle: true }) : null,
    item.data.title ? sanitizePromptInjection(item.data.title, { isTitle: true }) : null,
    firstNonBlankContent(item.data.description, item.data['media:description']),
  ])

  if (sanitizedSource) {
    parts.push(`Source: ${sanitizedSource}`)
  }

  if (sanitizedTitle) {
    parts.push(`Title: ${sanitizedTitle}`)
  }

  if (sanitizedDescription) {
    parts.push(`Description: ${sanitizedDescription}`)
  }

  if (item.published_at) {
    parts.push(`Published: ${item.published_at.toISOString()}`)
  }

  if (story_id) {
    parts.push(`Existing story ID: ${story_id}`)
  }

  return parts.join('\n')
}

async function firstNonBlankContent(...fields: Array<string | undefined>): Promise<string | null> {
  const field = firstVisibleRssTextField(fields)
  return field ? sanitizePromptInjection(field) : null
}

export async function buildClusteringAgentContent(
  newItem: ViewRssFeedItem,
  candidates: Array<{ item: ViewRssFeedItem; candidate: CandidateRow }>,
): Promise<ClusteringAgentContent> {
  const newItemText = await formatItem(newItem, 'New Article', null)
  const candidateParts = await pMap(
    candidates,
    ({ item, candidate }) => formatItem(item, 'Candidate Article', candidate.story_id),
    { concurrency: CANDIDATE_FORMAT_CONCURRENCY, stopOnError: false },
  )

  const rawContent = [
    '## New Article',
    newItemText,
    '',
    '## Candidate Articles',
    candidateParts.join('\n\n---\n\n'),
  ].join('\n')

  const content = wrapExternalContent(rawContent, {
    source: 'rss_feed',
    contentType: 'article',
  })

  return { content }
}
