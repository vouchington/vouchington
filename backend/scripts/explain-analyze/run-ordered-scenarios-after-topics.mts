import { runUserListCapacityScenario } from './run-scenarios/user-list-capacity.mts'
import {
  runTopicAliasCapacityScenario,
  runTopicHostnameCapacityScenario,
} from './run-scenarios/topic-identity-capacity.mts'
import { runTopHashtagCapacityScenario } from './run-scenarios/top-hashtag-capacity.mts'
import { runTopicChildCapacityScenario } from './run-scenarios/topic-child-capacity.mts'
import { runUrlEmbedCapacityScenario } from './run-scenarios/url-embed-capacity.mts'
import {
  runReviewRatingWriteCapacity,
  runDataPointTopicInsertCapacity,
  runDataPointTopicReplaceCapacity,
} from './run-scenarios/post-topic-write-capacity.mts'

export const AFTER_TOPICS_RUNNERS: readonly (() => Promise<unknown>)[] = [
  runUserListCapacityScenario,
  runTopicAliasCapacityScenario,
  runTopicHostnameCapacityScenario,
  runTopHashtagCapacityScenario,
  runTopicChildCapacityScenario,
  runUrlEmbedCapacityScenario,
  runReviewRatingWriteCapacity,
  runDataPointTopicInsertCapacity,
  runDataPointTopicReplaceCapacity,
]
