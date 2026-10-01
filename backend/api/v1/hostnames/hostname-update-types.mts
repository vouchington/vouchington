/** Closed request body for `PATCH /api/v1/hostnames/:id`. */
export type UpdateHostnameBody = {
  blocked?: boolean
  crawlable?: boolean
  skip_web_risk?: boolean
  link_rel_follow?: boolean
  ignore_robots_txt?: boolean | null
  unreliable_status_codes?: number[] | null
}
