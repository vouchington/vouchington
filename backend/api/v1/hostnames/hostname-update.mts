import { readOptionalUnreliableStatusCodes } from '@modules/rss-unreliable-status-codes'
import type { UpdateHostnameBody } from './hostname-update-types.mts'

/**
 * Projects a contract-validated body onto the hostname fields the admin route may change. Field
 * types were already enforced by the request contract; status-code content is still checked here.
 */
export function readHostnameChanges(body: UpdateHostnameBody): UpdateHostnameBody {
  const changes: UpdateHostnameBody = {}
  if (body.is_blocked !== undefined) changes.is_blocked = body.is_blocked
  if (body.is_crawlable !== undefined) changes.is_crawlable = body.is_crawlable
  if (body.should_skip_web_risk !== undefined)
    changes.should_skip_web_risk = body.should_skip_web_risk
  if (body.should_follow_link_rel !== undefined)
    changes.should_follow_link_rel = body.should_follow_link_rel
  if (body.should_ignore_robots_txt !== undefined)
    changes.should_ignore_robots_txt = body.should_ignore_robots_txt
  if ('unreliable_status_codes' in body) {
    changes.unreliable_status_codes = readOptionalUnreliableStatusCodes(
      body.unreliable_status_codes,
      'unreliable_status_codes',
    )
  }
  return changes
}
