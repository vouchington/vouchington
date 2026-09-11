// Canonical definition lives in @voucha/config (avoids a @services/crawlers <->
// @services/crawls workspace cycle: crawlers needs this retention window but must
// not depend back on services/crawls).
export { CRAWL_HTML_SNAPSHOT_RETENTION_DAYS } from '@voucha/config'
