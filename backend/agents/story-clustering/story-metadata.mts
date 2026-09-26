import { visibleRssText } from '@modules/utils'

/**
 * `stories.title` is `TEXT CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 500)`
 * (0170-00-00-stories-hn-discussions.sql) -- `char_length` counts characters, not UTF-16 code
 * units, so this truncates by code point (`Array.from`) to avoid ever splitting a surrogate pair
 * into an unpaired half.
 */
const STORY_TITLE_MAX_CODE_POINTS = 500

/**
 * A story created by the Choice classifier has no LLM-authored headline (unlike the old
 * per-decision agent's freeform `reason`): every new story's `cluster_reason` is this fixed,
 * opaque constant. Nothing in the schema or any reader parses `cluster_reason` as anything but
 * display text (grepped `cluster_reason` across backend and web).
 */
export const STORY_CLUSTER_REASON = 'Clustered by the story-clustering Choice classifier.'

export type NewStoryMetadataInput = {
  /** The incoming (not-yet-clustered) RSS feed item's own `published_at` -- always concrete,
   *  never null, at the item level (`ViewRssFeedItem.published_at: Date`). */
  incomingPublishedAt: Date
  /** The selected standalone candidate's own title/published_at, read fresh at pair-creation
   *  time -- never the incoming item's title, and never LLM-derived. */
  selectedItem: { title: string | undefined; published_at: Date }
}

export type NewStoryMetadata = {
  title: string | undefined
  published_at: Date
  cluster_reason: string
}

/**
 * Cleans a raw, potentially HTML-laden RSS title field into `stories.title`-safe text: decodes
 * entities, strips markup (`visibleRssText`), collapses whitespace, and truncates to the column's
 * 500-code-point cap. An empty-after-cleaning title becomes `undefined` (never `''`, which would
 * violate the column's `BETWEEN 1 AND 500` check) so the caller stores `NULL` and downstream
 * readers fall back to the item's own title (`story-post-create.mts`'s `single_item_title`).
 */
export function normalizeStoryTitle(rawTitle: string | undefined): string | undefined {
  if (!rawTitle) return undefined
  const cleaned = visibleRssText(rawTitle)
  if (cleaned.length === 0) return undefined
  const codePoints = Array.from(cleaned)
  if (codePoints.length <= STORY_TITLE_MAX_CODE_POINTS) return cleaned
  return codePoints.slice(0, STORY_TITLE_MAX_CODE_POINTS).join('')
}

/**
 * Derives a newly-created story's metadata from the pair being clustered. Two independent
 * per-field rules, not one "earliest member wins on both" rule:
 * - `title` comes only from the selected (standalone) member's own title -- the incoming item's
 *   title is never used, since the incoming item is what's being matched *against* the title.
 * - `published_at` is the earlier of the two members' own `published_at` (both always concrete),
 *   independent of which member supplied the title.
 */
export function deriveNewStoryMetadata(input: NewStoryMetadataInput): NewStoryMetadata {
  const published_at =
    input.selectedItem.published_at.getTime() < input.incomingPublishedAt.getTime()
      ? input.selectedItem.published_at
      : input.incomingPublishedAt
  return {
    title: normalizeStoryTitle(input.selectedItem.title),
    published_at,
    cluster_reason: STORY_CLUSTER_REASON,
  }
}
