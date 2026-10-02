import { visibleRssText } from '@modules/utils'

/**
 * `stories.title` is `TEXT CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 500)`;
 * `char_length` counts characters, not UTF-16 code units, so a long title is truncated by code point
 * (`Array.from`) to never split a surrogate pair.
 */
const STORY_TITLE_MAX_CODE_POINTS = 500

/**
 * The story-clustering classifier decides membership only: it writes no headline or explanation.
 * Every story it creates records this fixed, opaque `cluster_reason`, which no reader parses.
 */
export const STORY_CLUSTER_REASON = 'Clustered by the story-clustering Choice classifier.'

/**
 * Cleans a raw, potentially HTML-laden RSS title into `stories.title`-safe text: decodes entities,
 * strips markup, collapses whitespace and truncates to the column cap. A title that is empty after
 * cleaning is `undefined` (never `''`, which the column's check rejects), so the story stores NULL
 * and readers fall back to the item's own title.
 */
export function normalizeStoryTitle(rawTitle: string | undefined): string | undefined {
  if (!rawTitle) return undefined
  const cleaned = visibleRssText(rawTitle)
  if (cleaned.length === 0) return undefined
  const codePoints = Array.from(cleaned)
  if (codePoints.length <= STORY_TITLE_MAX_CODE_POINTS) return cleaned
  return codePoints.slice(0, STORY_TITLE_MAX_CODE_POINTS).join('')
}

export type NewStoryMetadataInput = {
  /** The classified item's own `published_at`. */
  incomingPublishedAt: Date
  /** The chosen standalone item, read under its lock when the story is created. */
  selectedItem: { title: string | undefined; published_at: Date }
}

export type NewStoryMetadata = {
  title: string | undefined
  published_at: Date
  cluster_reason: string
}

/**
 * A new story's metadata, derived deterministically from its two founding members. The title is the
 * chosen standalone item's (the classified item is what is being matched against it, so its own
 * title never names the story); `published_at` is the earlier member's, whichever supplied the title.
 */
export function deriveNewStoryMetadata(input: NewStoryMetadataInput): NewStoryMetadata {
  const { incomingPublishedAt, selectedItem } = input
  return {
    title: normalizeStoryTitle(selectedItem.title),
    published_at:
      selectedItem.published_at.getTime() < incomingPublishedAt.getTime()
        ? selectedItem.published_at
        : incomingPublishedAt,
    cluster_reason: STORY_CLUSTER_REASON,
  }
}
