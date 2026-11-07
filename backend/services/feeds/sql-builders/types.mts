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
