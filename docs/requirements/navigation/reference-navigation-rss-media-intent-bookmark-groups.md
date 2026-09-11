# Navigation reference

[Back to Navigation](NAVIGATION.md)

## RSS Media Intent Bookmark Groups

The News, Podcasts, and Videos intents each contain **two** auth-gated bookmark groups after
their `Browse` group, splitting content-item relations from source relations:

| Intent   | Content group label | Content `dataPw`                  | Source group label | Source `dataPw`                  |
| -------- | ------------------- | --------------------------------- | ------------------ | -------------------------------- |
| News     | News Bookmarks      | `sidebar-group-news-bookmarks`    | Source Bookmarks   | `sidebar-group-source-bookmarks` |
| Podcasts | Episode Bookmarks   | `sidebar-group-episode-bookmarks` | Source Bookmarks   | `sidebar-group-source-bookmarks` |
| Videos   | Video Bookmarks     | `sidebar-group-video-bookmarks`   | Source Bookmarks   | `sidebar-group-source-bookmarks` |

**Naming convention:**

- Content groups use a content-specific noun: "News Bookmarks", "Episode Bookmarks", "Video
  Bookmarks".
- Source groups always use the shared label "Source Bookmarks" regardless of intent.

**Recently Viewed source items** use intent-specific labels and routes:

| Intent   | Label                        | `dataPw`                             | Route                     |
| -------- | ---------------------------- | ------------------------------------ | ------------------------- |
| News     | Recently Viewed News Sources | `sidebar-nav-my-news-sources-viewed` | `/my/news-sources/viewed` |
| Podcasts | Recently Viewed Podcasts     | `sidebar-nav-my-podcasts-viewed`     | `/my/podcasts/viewed`     |
| Videos   | Recently Viewed Channels     | `sidebar-nav-my-channels-viewed`     | `/my/channels/viewed`     |
