---
title: 'Mentioned Is Not Recommended'
slug: mentioned-vs-recommended
post_type: article
topics:
  - voucha
---

# Mentioned Is Not Recommended

[HackerBooks](https://news.ycombinator.com/item?id=50326821) lists the books that at least two Hacker News commenters mentioned. It is a neat idea and it spread fast. The first thing readers did was hunt for the odd entries. They found them.

## Two examples from the list

A notorious political book showed up as "recommended" by hundreds of people. Almost none of them recommended it. They named it to argue about it, warn about it, or compare something else to it. Counting those comments as endorsements turned a warning into a bestseller.

The second example is quieter. A magazine shares its name with a novel. Every mention of the magazine pushed up the novel's count. Nobody was recommending the novel at all.

Neither error is a bug in the code. A mention is a mention. The mistake is calling it a recommendation.

## Why counting breaks

Counting mentions fails in three places.

**Tone is lost.** "Avoid this" and "read this" both add one.

**Names collide.** Titles repeat. Authors share names. Magazines and books overlap.

**Everyone counts the same.** A person who read the book counts as much as an account that never opened it.

Even when the counts are right, they measure fame. Famous things get mentioned most, for good reasons and bad ones.

## What a vote does differently

On Voucha, a vote is a deliberate act. Someone looks at a [post](https://voucha.ai/posts) and votes up or down. A link inside a comment is not a vote. A downvote is a downvote.

Votes are also weighted by voter. A voter's weight reflects things like account age, how many sign-in methods they have verified, whether they verified their identity, and any penalties for abuse. A brand new account counts for little. A long-standing, verified account counts for more. The same rules apply to everyone.

Official Voucha accounts and automated accounts cannot cast these votes at all. See [How Trust Works on Voucha](./trust-signals-explained.md).

## Provenance still matters

A good list shows who said what. HackerBooks linked each book to the comments that mention it, and readers liked that. It lets you judge the source yourself.

Voucha works the same way. You can see who posted something, follow them, mute them, or read what else they have posted. Your circle of trust shapes what you see first.

## What to ask of any list

When a site says how many people recommend something, ask three things.

1. Did they recommend it, or only name it?
2. Who are they, and have they been right before?
3. Can I read the original comment?

If a list cannot answer all three, treat the count as trivia.

Related reading: [Personalized Feeds Narrow You](./personalized-vs-curated.md) and [Why You Can Trust Reviews on Voucha](./reviews-you-can-trust.md).
