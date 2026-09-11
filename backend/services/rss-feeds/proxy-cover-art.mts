// Relocated to @modules/rss-feed-cover-art (shared with @services/rss-feed-items, which used
// to pull this from here — that reverse edge caused a workspace cycle). Re-exported here so
// existing consumers (backend/api/v1/rss-feeds/**, communities, hostnames) keep working
// unchanged.
export { proxyRssFeedCoverArt } from '@modules/rss-feed-cover-art/proxy-cover-art'
