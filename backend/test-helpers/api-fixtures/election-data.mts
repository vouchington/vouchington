import { post, rssFeedItem, timestamp, topic, user } from './data.mts'

export const topicElection = {
  __entity_type: 'topic_election',
  id: topic.id,
  votes_count_down: 1,
  votes_count_up: 6,
  votes_score_net: 5,
}

export const rssFeedItemElection = {
  __entity_type: 'rss_feed_item_election',
  id: rssFeedItem.id,
  votes_count_down: 2,
  votes_count_up: 7,
  votes_score_net: 5,
}

export const swiftRssFeedItemElection = {
  __entity_type: 'rss_feed_item_election',
  id: rssFeedItemElection.id,
  votes_count_down: 2,
  votes_count_up: 7,
  votes_score_net: rssFeedItemElection.votes_score_net,
}

export const postElection = {
  __entity_type: 'post_election',
  id: post.id,
  votes_count_down: 1,
  votes_count_up: 4,
  votes_score_net: 3,
}

export const electionVotes = {
  [post.id]: {
    __entity_type: 'election_vote',
    created_at: timestamp,
    entity_id: post.id,
    choice: 'like',
    user_id: user.id,
  },
  [rssFeedItem.id]: {
    __entity_type: 'election_vote',
    created_at: timestamp,
    entity_id: rssFeedItem.id,
    choice: 'like',
    user_id: user.id,
  },
  [topic.id]: {
    __entity_type: 'election_vote',
    created_at: timestamp,
    entity_id: topic.id,
    choice: 'like',
    user_id: user.id,
  },
}
