import sql, { type SQLStatement } from 'sql-template-strings'
import { buildItemTopicPredicateMatch } from './item-membership.mts'
import { buildViewerMembership } from './viewer-membership.mts'

export function appendRssFeedItemTopicMuteFilters(
  query: SQLStatement,
  rssFeedItemId: SQLStatement,
): void {
  query
    .append(sql` AND NOT `)
    .append(
      buildItemTopicPredicateMatch(
        rssFeedItemId,
        topicId => buildViewerMembership(topicId, 'mute', 'topic'),
        true,
      ),
    )
}
