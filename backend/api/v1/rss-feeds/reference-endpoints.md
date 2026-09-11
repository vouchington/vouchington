# Endpoints

[Back to RSS Feeds API](README.md#endpoints)

| Method | Route                                   | Authentication               | HTTP Caching | Description                         |
| ------ | --------------------------------------- | ---------------------------- | ------------ | ----------------------------------- |
| GET    | `/api/v1/rss-feeds`                     | Optional                     | Yes (anon)   | Search RSS feeds                    |
| POST   | `/api/v1/rss-feeds`                     | Required (auth)              | No           | Submit a source (create or upvote)  |
| GET    | `/api/v1/rss-feeds/:id`                 | Optional                     | Yes (anon)   | Get an RSS feed                     |
| PATCH  | `/api/v1/rss-feeds/:id`                 | Required (admin)             | No           | Update an RSS feed                  |
| DELETE | `/api/v1/rss-feeds/:id`                 | Required (admin)             | No           | Delete an RSS feed                  |
| GET    | `/api/v1/rss-feeds/:id/crawls`          | Required (Plus/Pro or admin) | No           | List cursor-paginated crawl history |
| GET    | `/api/v1/rss-feeds/:id/crawls/:crawlId` | Required (Plus/Pro or admin) | No           | Get a single crawl by ID            |
| POST   | `/api/v1/rss-feeds/:id/refreshes`       | Required (admin)             | No           | Enqueue a manual refresh            |
| GET    | `/api/v1/rss-feeds/trending`            | Optional                     | Yes (anon)   | Trending feeds (time-based)         |
| GET    | `/api/v1/rss-feeds/recommended`         | Required (auth)              | No           | Recommended feeds (personalized)    |
