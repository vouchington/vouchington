/**
 * Everything the product writes when it creates an RSS feed source for one feed URL
 * (`createRssFeedSource`), with fixed UUIDv7 ids. `urls.url`, `pathname` and the slug are the
 * values `normalizeUrlForUrlTable` and `generateSourceDetails` produce, pinned by the test.
 * The ids carry a timestamp from before any real change row, so a later `uuidv7()` enablement
 * change always sorts after the initial one (the sync triggers read `ORDER BY id DESC`).
 *
 * The config-driven entrypoint `0080-00-01a-staging-rss-feeds.mts` runs after
 * `0080-00-01-publisher-type-topics.mts` and before
 * `0080-00-02-publisher-type-relations.sql`, so the Cloudflare topic exists when that SQL file
 * relates it to its `blog` publisher type.
 */
export type StagingRssFeed = {
  readonly url: string
  readonly hostname: string
  readonly pathname: string
  readonly title: string
  readonly slug: string
  readonly ids: {
    readonly hostname: string
    readonly url: string
    readonly topic: string
    readonly alias: string
    readonly feed: string
    readonly enablement: string
    readonly discoverability: string
  }
}

export const STAGING_RSS_FEEDS: readonly StagingRssFeed[] = [
  {
    url: 'https://www.theguardian.com/science/rss',
    hostname: 'www.theguardian.com',
    pathname: '/science/rss',
    title: 'The Guardian Science',
    slug: 'the-guardian-science-theguardian-com-science-rss',
    ids: {
      hostname: '01a0f4c2-c400-7692-aa38-ab180ba72f58',
      url: '01a0f4c2-c400-7be6-a84f-a5327e9babf4',
      topic: '01a0f4c2-c400-7bb6-af71-80c063f930e2',
      alias: '01a0f4c2-c400-73b6-a97e-430ebbebc265',
      feed: '01a0f4c2-c400-73df-a7c1-edb8b8ed9c49',
      enablement: '01a0f4c2-c400-7956-90fb-f4a11c5b8b23',
      discoverability: '01a0f4c2-c400-7429-b5dc-124ed59cd83b',
    },
  },
  {
    url: 'https://blog.cloudflare.com/rss/',
    hostname: 'blog.cloudflare.com',
    pathname: '/rss/',
    title: 'Cloudflare Blog',
    slug: 'cloudflare-blog-blog-cloudflare-com-rss',
    ids: {
      hostname: '01a0f4c2-c400-76eb-aec6-0e1194d6ec35',
      url: '01a0f4c2-c400-7034-9cac-c533d92746c2',
      topic: '01a0f4c2-c400-7010-89ad-d299c6ba91f5',
      alias: '01a0f4c2-c400-7d65-8f4d-a88bd4a9c51a',
      feed: '01a0f4c2-c400-78bb-a113-060eddca3e66',
      enablement: '01a0f4c2-c400-74f9-80d0-907dce8e7df8',
      discoverability: '01a0f4c2-c400-79af-87f1-57593fa02deb',
    },
  },
  {
    url: 'https://www.quantamagazine.org/feed/',
    hostname: 'www.quantamagazine.org',
    pathname: '/feed/',
    title: 'Quanta Magazine',
    slug: 'quanta-magazine-quantamagazine-org-feed',
    ids: {
      hostname: '01a0f4c2-c400-757d-840b-e651ee1ae676',
      url: '01a0f4c2-c400-7ba6-b137-8efb0ffbf089',
      topic: '01a0f4c2-c400-71fd-bc96-fe4899ecc16a',
      alias: '01a0f4c2-c400-7398-86e0-0d09b31e65a3',
      feed: '01a0f4c2-c400-71a8-809a-48f50e68fba7',
      enablement: '01a0f4c2-c400-7704-9390-83b64402efb8',
      discoverability: '01a0f4c2-c400-7d51-bfb9-56618d6805cb',
    },
  },
]
