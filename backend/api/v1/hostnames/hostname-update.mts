import { readOptionalUnreliableStatusCodes } from '@modules/rss-unreliable-status-codes'

/** Closed request body for `PATCH /api/v1/hostnames/:id`. */
export type UpdateHostnameBody = {
  blocked?: boolean
  crawlable?: boolean
  skip_web_risk?: boolean
  link_rel_follow?: boolean
  ignore_robots_txt?: boolean | null
  unreliable_status_codes?: number[] | null
}

/**
 * Projects a contract-validated body onto the hostname fields the admin route may change. Field
 * types were already enforced by the request contract; status-code content is still checked here.
 */
export function readHostnameChanges(body: UpdateHostnameBody): UpdateHostnameBody {
  const changes: UpdateHostnameBody = {}
  if (body.blocked !== undefined) changes.blocked = body.blocked
  if (body.crawlable !== undefined) changes.crawlable = body.crawlable
  if (body.skip_web_risk !== undefined) changes.skip_web_risk = body.skip_web_risk
  if (body.link_rel_follow !== undefined) changes.link_rel_follow = body.link_rel_follow
  if (body.ignore_robots_txt !== undefined) changes.ignore_robots_txt = body.ignore_robots_txt
  if ('unreliable_status_codes' in body) {
    changes.unreliable_status_codes = readOptionalUnreliableStatusCodes(
      body.unreliable_status_codes,
      'unreliable_status_codes',
    )
  }
  return changes
}
