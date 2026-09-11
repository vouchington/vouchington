# Reporting & Content Moderation reference

[Back to Reporting & Content Moderation](REPORTING.md)

## Reportable entities

| Entity type     | Example surface                | Placement                                                    |
| --------------- | ------------------------------ | ------------------------------------------------------------ |
| `rss_feed_item` | `/news` cards, news-item modal | `FollowerShareActions` kebab + inline button in modal footer |
| `post`          | Post cards, post detail page   | `FollowerShareActions` kebab                                 |
| `comment`       | Comment nodes in discussions   | `ReportMenuKebab` in comment header                          |
| `user`          | User profile page              | `ReportInlineButton` in `UserActionsAside`                   |
| `url_hostname`  | Domain, URL, and crawl detail  | Domain moderation actions                                    |

Post and comment reports require the reporter to be able to view the target. Comments inherit
their root post's audience and post-clearance state for this check, while the self-report guard
still applies to the reported comment's author. Workflow-only post types that are blocked from
generic post routes, such as `topic_recommendation`, are not reportable as generic `post` targets;
comments under those roots are not reportable as generic `comment` targets.

URL detail, crawl-history, and crawl-detail surfaces report the URL's associated canonical hostname
UUID as `url_hostname`. They do not introduce a `url` report type. Native clients hide the action
for signed-out viewers and for blocked or missing hostnames.

---
