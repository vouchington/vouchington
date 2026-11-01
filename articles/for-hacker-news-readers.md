---
title: 'Voucha for Hacker News Readers'
slug: for-hacker-news-readers
post_type: article
topics:
  - voucha
---

# Voucha for Hacker News Readers

This week two projects showed how much Hacker News readers like a good recommendation. [HackerTube](https://news.ycombinator.com/item?id=50319510) put 6,400 videos from HN comments into a YouTube-style browser. [HackerBooks](https://news.ycombinator.com/item?id=50326821) did the same for 16,500 books. Voucha has no connection to either project. We read the threads closely, because the complaints and requests in them describe things we also care about.

## What the threads asked for

- Recommendations from people you trust, not from a model.
- Fresh results. Static dumps go stale.
- A way to tell "recommended" from "mentioned." See [Mentioned Is Not Recommended](./mentioned-vs-recommended.md).
- Feeds. Several people asked for RSS.
- Pages that outlive a weekend project.

Voucha does some of this today. Here is the part that exists.

## See the HN thread next to the link

Turn on related Hacker News discussions in your preferences. Voucha will then look up the page you are reading, whether it is a [post](/posts) or a news item, and show matching HN threads in a side panel with points and comment counts. The lookup runs in your browser against the public HN search service, and it is off until you opt in.

## RSS in and out

Voucha reads RSS and Atom. Add blogs, podcasts and YouTube channels as sources, and import or export your list as OPML. Your subscriptions live in one place and you can take them with you. See [RSS Is Back](./rss-feeds-comeback.md).

## Communities with curated lists

A [community](/communities) is a group built around one subject, with owners and moderators. They can keep lists of topics, sources, posts, domains and URLs. Join one that matches your field. Subscribe to its sources. See [Voucha Communities](./communities-explained.md).

## Votes with weights

The usual complaint about crowd ranking is that it is easy to game. Voucha weights each vote by the voter. Account age, verified sign-in methods, identity verification and abuse penalties all count. Official Voucha accounts and bots cannot cast these votes. You can also mute users, domains and feeds, so what you see is your own view. See [How Trust Works on Voucha](./trust-signals-explained.md).

## For your agent

Agents are welcome. Voucha publishes an `llms.txt` and runs an MCP server, so a coding agent or a chat client can read and search with your permission. Content created through MCP or the API carries a visible provenance label. Details are in [Voucha for Developers](./for-developers.md).

## Permanence

A common worry in both threads was that a site would disappear. We cannot promise anything about the future. We can say that public posts and articles have Markdown versions, that your subscriptions export as OPML, and that you can download a copy of your own data. Read [Voucha for Developers](./for-developers.md) for the technical side.

## Money

We are candid about it: [How Voucha Makes Money](./how-voucha-makes-money.md).

## Where to start

Join a few [communities](/communities), add some sources from [news](/news), and turn on the HN panel. Then read [How to Use Voucha](./how-to-use-voucha.md).
