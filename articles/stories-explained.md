---
title: 'Follow the Story, Not the Headline: How Voucha Stories Work'
slug: stories-explained
post_type: article
topics:
  - voucha
---

# Follow the Story, Not the Headline: How Voucha Stories Work

When a major product launches, twelve outlets publish coverage within a few hours. Your feed fills with variations of the same headline. You end up reading three articles saying the same thing before you find the one that actually adds something new.

Voucha Stories fixes this. Instead of one entry per publication, you get one entry per event — and you can expand to see every source that covered it.

## What a Story Is

A story is a group of RSS feed items all covering the same specific news event. Each story has:

- **A title** — generated from the content of the grouped items
- **An event date** — when the event actually happened (not when it was covered)
- **An official item** — the canonical primary source: the company's press release, the original announcement, the first credible report
- **All grouped items** — every piece of coverage collected under this event

Your feed shows one entry per story. Click to expand and you can see every outlet that covered it, compare how they framed it, and decide which source you actually want to read.

## What Gets Grouped Together — and What Doesn't

The grouping applies specific rules about what counts as "the same story":

**Grouped together:**

- Multiple outlets covering the same product announcement
- Follow-up coverage that directly references the original event
- Regional editions of the same news item

**Kept separate:**

- A product launch announcement vs. a product review
- An official announcement vs. a rumor or leak about the same product
- Speculation vs. confirmed news, even on the same topic

The distinction matters. A rumor that Apple is building a foldable phone and Apple's actual announcement of the foldable phone are different stories — even though they're about the same product. Grouping them would conflate speculation with fact.

## How the Grouping Works

After each new RSS feed item is ingested and its embedding computed, the system searches for similar items using pgvector's semantic search. It finds up to 5 candidates within a cosine distance threshold and sends them to the story-teller agent.

The agent decides whether any of the candidates belong to the same specific event. If yes, it also identifies the title, the event date, and which item is the official source. If no match is found, the item stays standalone and may become the seed for a future story.

The window for joining an existing story is **4 days forward from the story's event date**. Coverage that appears more than 4 days after the event is treated as a later development, not original coverage. This keeps the original story clean and prevents stale follow-up content from muddying the event cluster.

## The Official Item

Each story designates one item as the official source — typically the primary announcement from the company itself, the first credible reporting, or the most authoritative source for the event.

The story-teller agent selects the official item during grouping. Admins can also manually lock or override the official designation when needed.

When a story has an official item, your feed shows that item's metadata — title, source, image — as the default. You can always see all the grouped items by expanding the story.

## Why This Changes How You Read News

The practical effect: a feed with a lot less noise. Instead of 12 headlines about the same announcement, you see one entry. If you want depth, expand and read multiple sources. If you want to move on, one entry tells you what happened.

Stories also make it easier to see where news actually breaks. When a story's official item is from a primary source and everything else under it arrived two hours later, you can see who had it first.

And the conservative grouping approach — rumors stay separate from announcements, reviews stay separate from launches — means you can trust that items in the same story are genuinely covering the same event, not just the same subject.

Follow the story. Skip the noise.
