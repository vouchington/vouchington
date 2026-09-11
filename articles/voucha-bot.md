---
title: 'Voucha Bot'
slug: voucha-bot
post_type: article
topics:
  - voucha
---

# Voucha Bot

If you run a website, here's what you should know about how Voucha crawls content — and how to opt out if you want to.

## When We Crawl a Page

We only crawl pages based on explicit triggers:

- A user, editor, or administrator submitted the URL
- We ingest the site's RSS feed
- A URL was surfaced through an AI agent (e.g. a user's chat recommended a URL, after which we index it)

We don't crawl the open web speculatively.

## How We Crawl

- We do not look at your sitemap.
- We do not crawl your entire site automatically.
- We do not crawl any domain more than once per second.
- We do not execute JavaScript, except for very specific exceptions.
- We do respect your `robots.txt`.

## How to Block Us

You can block Voucha bot entirely by adding the following to your `robots.txt`:

```
User-agent: voucha-bot
Disallow: *
```
