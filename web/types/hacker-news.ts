/** Counts of Hacker News stories and comments that link to a page. API fields are facts, not text. */
export interface HackerNewsReferenceCounts {
  story_count: number
  comment_count: number
}

export interface HackerNewsStoryReference {
  hacker_news_item_id: number
  points: number
  reply_count: number
  posted_at: string
}

export interface HackerNewsCommentReference {
  hacker_news_item_id: number
  parent_story_item_id: number
  posted_at: string
}

export interface HackerNewsReferenceDetail extends HackerNewsReferenceCounts {
  stories: HackerNewsStoryReference[]
  comments: HackerNewsCommentReference[]
}
