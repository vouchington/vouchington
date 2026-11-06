/** Defines card URL membership and has_hacker_news_references; this shared top ten must stay fixed. */
export const HACKER_NEWS_RELATED_URLS_PER_POST_MAX = 10

export type HackerNewsReferenceCounts = {
  story_count: number
  comment_count: number
}

export type HackerNewsStoryReference = {
  hacker_news_item_id: number
  points: number
  reply_count: number
  posted_at: string
}

export type HackerNewsCommentReference = {
  hacker_news_item_id: number
  parent_story_item_id: number
  posted_at: string
}

export type HackerNewsReferenceDetail = HackerNewsReferenceCounts & {
  stories: HackerNewsStoryReference[]
  comments: HackerNewsCommentReference[]
}
