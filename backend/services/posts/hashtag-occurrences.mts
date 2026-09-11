import { getHashtagSearchableMarkdown } from './hashtag-searchable-markdown.mts'
import type { CreatePostUpdates } from './types.mts'
import { normalizeHashtag } from '@ts-shared/utils'
import { maskHashtagBearingUrls } from '@modules/utils'

export type HashtagSource = 'title' | 'markdown' | 'explicit'
export type HashtagOccurrence = {
  key: string
  authored: string
  source: HashtagSource
}

export function getPostHashtagOccurrences(updates: CreatePostUpdates): HashtagOccurrence[] {
  return [
    ...extractHashtagsFromTitle(updates.title ?? ''),
    ...extractHashtagsFromMarkdown(updates.markdown ?? '', 'markdown'),
    ...(updates.categories ?? []).flatMap(category =>
      category.type === 'hashtag' ? extractExplicitHashtag(category.hashtag) : [],
    ),
  ]
}

function extractHashtagsFromTitle(input: string): HashtagOccurrence[] {
  return extractHashtags(maskHashtagBearingUrls(input), 'title')
}

export function extractExplicitHashtag(input: string): HashtagOccurrence[] {
  const normalized = normalizeHashtag(input)
  return normalized
    ? [{ key: normalized.key, authored: normalized.authored, source: 'explicit' }]
    : []
}

function extractHashtagsFromMarkdown(input: string, source: HashtagSource): HashtagOccurrence[] {
  return extractHashtags(getHashtagSearchableMarkdown(input), source)
}

function extractHashtags(input: string, source: HashtagSource): HashtagOccurrence[] {
  const occurrences: HashtagOccurrence[] = []
  for (const match of input.matchAll(
    /(^|[^A-Za-z0-9_-])(#[A-Za-z0-9._-]+)(?=$|[^\p{L}\p{N}_-])/gu,
  )) {
    const authored = match[2]!.replace(/[._-]+$/, '')
    const normalized = normalizeHashtag(authored)
    if (normalized) occurrences.push({ key: normalized.key, authored, source })
  }
  return occurrences
}
