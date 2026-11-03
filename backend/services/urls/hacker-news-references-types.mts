/** Most story rows stored for one URL; totals keep the real count. */
export const HACKER_NEWS_STORY_CAP_PER_URL = 25
/** Most comment rows stored for one URL; totals keep the real count. */
export const HACKER_NEWS_COMMENT_CAP_PER_URL = 25
/** Most URL ids in one read statement; larger batches are split into several reads. */
export const HACKER_NEWS_URL_BATCH_MAX = 200
/** Most related URLs of one post that contribute references. */
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
