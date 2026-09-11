# Community Lists reference

[Back to Community Lists](community-lists.md)

## Overview

Lists are an extension of the community entity. Each community has one "Lists" menubar dropdown containing separate lists per entity type:

- **Topics**: discussion threads the community values
- **Sources**: news sources and external feeds
- **Posts**: individual items worth highlighting
- **Domains**: websites of particular interest or concern
- **URLs**: specific web pages

Only the community owner and moderators can add or remove items. Members (and non-members on public communities) can view the lists. Private communities limit list visibility to members.

## Feed Views

Community lists also act as feed sources:

- A community always exposes a **Posts** tab for the community-published post feed.
- A community with active topic or RSS feed list items exposes a **News** tab at
  `/communities/:slug/news`. It shows RSS feed items from the community's listed RSS feeds plus RSS
  items categorized under the community's listed topics.
- Community news supports the same source/topic split as the signed-in News Feed:
  `/communities/:slug/news` for All, `/communities/:slug/news/sources` for listed RSS feeds, and
  `/communities/:slug/news/topics` for listed topics. It does not include a Friends filter because
  community news is list-sourced, not follower-sourced.

The signed-in News Feed and Posts Feed pages include a community dropdown. The dropdown lists
communities in the viewer's own usable list graph: active memberships and active proxy-follows.
Proxy-muted communities are omitted because their sources remain excluded from personalized feed
queries. News Feed options require at least one topic or RSS feed list item; Posts Feed options
require at least one topic list item.

## Entity Types

Lists support five entity types, each stored in a separate table to enforce polymorphic-free schema design:

| Type           | Entity       | Purpose                    |
| -------------- | ------------ | -------------------------- |
| `topic`        | Topic        | Discussion threads         |
| `rss_feed`     | RSS Feed     | News and content sources   |
| `post`         | Post         | Specific articles or items |
| `url_hostname` | URL Hostname | Domains of interest        |
| `url`          | URL          | Specific web pages         |
