import { timestamp, user } from './data.mts'
import {
  anonymousComment,
  nestedComment,
  rootPost,
  topLevelComment,
} from './native-comment-thread-posts.mts'

export const rootPostElection = {
  __entity_type: 'post_election',
  id: rootPost.id,
  votes_count_down: 1,
  votes_count_up: 4,
  votes_score_net: 3,
}

export const topLevelCommentElection = {
  __entity_type: 'post_election',
  id: topLevelComment.id,
  votes_count_down: 0,
  votes_count_up: 8,
  votes_score_net: 8,
}

export const nestedCommentElection = {
  __entity_type: 'post_election',
  id: nestedComment.id,
  votes_count_down: 2,
  votes_count_up: 3,
  votes_score_net: 1,
}

export const anonymousCommentElection = {
  __entity_type: 'post_election',
  id: anonymousComment.id,
  votes_count_down: 0,
  votes_count_up: 1,
  votes_score_net: 1,
}

export const rootPostVote = {
  __entity_type: 'election_vote',
  entity_id: rootPost.id,
  user_id: user.id,
  choice: 'like',
  created_at: timestamp,
}

export const topLevelCommentVote = {
  __entity_type: 'election_vote',
  entity_id: topLevelComment.id,
  user_id: user.id,
  choice: 'like',
  created_at: timestamp,
}

export const nestedCommentVote = {
  __entity_type: 'election_vote',
  entity_id: nestedComment.id,
  user_id: user.id,
  choice: 'dislike',
  created_at: timestamp,
}

export const markdownToHtml = {
  [topLevelComment.id]: '<p>Top-level native comment</p>',
  [nestedComment.id]: '<p>Nested reply with votes</p>',
  [anonymousComment.id]: '<p>Anonymous native reply</p>',
}

export const bookmarkedPosts = {
  [topLevelComment.id]: { save: true },
  [nestedComment.id]: { save: true },
}
