/** Closed request body for `PATCH /api/v1/hostnames/:id`. */
export type UpdateHostnameBody = {
  is_blocked?: boolean
  is_crawlable?: boolean
  should_skip_web_risk?: boolean
  should_follow_link_rel?: boolean
  should_ignore_robots_txt?: boolean | null
  unreliable_status_codes?: number[] | null
}
