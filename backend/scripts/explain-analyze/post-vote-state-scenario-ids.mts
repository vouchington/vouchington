import {
  VOTE_HISTORY_POST_COUNT,
  VOTE_HISTORY_REVOTE_COUNT,
} from './seed-data/recommended-topics-vote-history.mts'

export const POST_VOTE_STATE_TRANSITION_SCENARIO_IDS = [
  'post-vote-state-initial',
  'post-vote-state-strength',
  'post-vote-state-clear',
  'post-vote-state-relike',
  'post-vote-state-noop',
] as const

export const VOTE_SEEDED_ROWS = {
  post_votes: 20_002 + VOTE_HISTORY_POST_COUNT + VOTE_HISTORY_REVOTE_COUNT,
  post_vote_states: 20_002 + VOTE_HISTORY_POST_COUNT,
  topic_votes: 5_000,
} as const
