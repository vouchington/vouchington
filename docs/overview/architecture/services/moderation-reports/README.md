# moderation-reports

Service for creating and querying user-submitted moderation reports against entities (RSS feed
items, posts, comments, users, and URL hostnames). Canonical entity types are `rss_feed_item`,
`post`, `comment`, `user`, and `url_hostname`.

## Data Model

| Column    | Type                      | Notes                                                                                          |
| --------- | ------------------------- | ---------------------------------------------------------------------------------------------- |
| Target FK | uuid                      | Exactly one of `post_id`, `reported_user_id`, `hostname_id`, or `rss_feed_item_id`             |
| `reason`  | moderation_report_reasons | One of `spam`, `harassment`, `misinformation`, `illegal_content`, `vote_manipulation`, `other` |

A report and its moderation case commit atomically; alerts, judgement refresh and integrity checks
run only after the owning commit. Duplicate pending reports from one reporter for one target are
prevented in the database. `vote_manipulation` is valid only for `post` reports. This summary is mirrored in code by the repo-file-policy guard (tracked
for retirement).

## Usage

Request contracts are in the [reports API requirements](../../../../requirements/api/v1/reports/README.md).
