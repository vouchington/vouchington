type EntityMentionBase = {
  raw: string // The original text including @ # or ! prefix
  identifier: string // The normalized lookup key without prefix
  startIndex: number
  endIndex: number
}

type UserMention = EntityMentionBase & {
  type: 'user'
}

type TopicMention = EntityMentionBase & {
  type: 'topic'
}

export type PostMention = EntityMentionBase & {
  type: 'post'
  source: 'identifier' | 'post_url' | 'comment_url'
}

export type EntityMention = UserMention | TopicMention | PostMention

export type ResolvedUserMention = {
  type: 'user'
  raw: string
  id: string
  username: string
  displayName: string
  url: string
}

export type ResolvedTopicMention = {
  type: 'topic'
  raw: string
  id: string
  slug: string
  name: string
  topicType: string
  url: string
}

export type ResolvedPostMention = {
  type: 'post'
  raw: string
  id: string
  slug: string
  title: string
  postType: string
  url: string
  displayText: string
  displayTitle: string
}

export type UnresolvedMention = {
  type: 'unresolved'
  raw: string
  reason: 'not_found' | 'error'
}

export type ResolvedMention =
  | ResolvedUserMention
  | ResolvedTopicMention
  | ResolvedPostMention
  | UnresolvedMention
