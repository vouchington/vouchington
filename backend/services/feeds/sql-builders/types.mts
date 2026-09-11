export type RelationConfig = {
  relationTable: string
  idColumn: string
  cteAlias: string
}

export type FollowedTopicsCondition =
  | {
      type: 'related_topics'
      tableName: string
      itemIdColumn: string
    }
  | {
      type: 'category_topics'
      tableName: string
      foreignKeyColumn: string
      itemIdColumn: string
    }
  | {
      type: 'review_topics'
      tableName: string
      itemIdColumn: string
    }

export type FeedTypeConfig = {
  sourceType: 'users' | 'rss_feeds'
  sourceIdColumn?: string
  scoreColumn: string
  followedCTEAlias: string
  followedCTEColumn: string
  topicsConditions: FollowedTopicsCondition[]
  minScoreSource: number
  minScoreTopics: number
  sourceMatchColumn?: string
  topicsMatchColumn?: string
}
