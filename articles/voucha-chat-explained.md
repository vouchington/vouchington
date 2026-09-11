---
title: 'Voucha Chat: How the Upcoming AI Feature Works'
slug: voucha-chat-explained
post_type: article
topics:
  - voucha
---

# Voucha Chat: How the Upcoming AI Feature Works

We're building a chat feature for Voucha — and it's not a general-purpose chatbot.

When it launches, Voucha Chat will be a multi-turn AI assistant grounded in the same trust network that powers the rest of the product. It won't search the open web. It will draw only from sources and data that the Voucha community has evaluated as trustworthy — and from what you've already told it about yourself.

Here's how it works, what it'll be able to do, and how it differs from ChatGPT or Perplexity.

## The Fundamental Difference

When you ask ChatGPT a question, it searches the open web and synthesizes whatever it finds. The quality of its answer depends entirely on what ranks in search — which means affiliate-driven reviews, content farms, and SEO-optimized marketing copy are all in the mix.

Voucha Chat is designed differently at the retrieval layer. The AI draws from:

- Structured data points submitted by real users (approval rates, failure rates, specs, real-world experiences)
- Community-voted reviews and discussions on topics you ask about
- Trust-scored domains and RSS feeds that your community has evaluated
- Your own profile (cards you hold, spending patterns, preferences you've set)

The retrieval corpus isn't "the internet." It's the subset of the internet that Voucha's community has verified as worth trusting — filtered further by your personal trust network.

## What the Chat Agent Will Be Able to Do

**Topic and data search.** Find and retrieve structured data points, community reviews, and discussions about any topic in the Voucha database. Ask "what's the approval rate for the Chase Sapphire Preferred with a 740 credit score?" and the agent queries community-contributed data rather than searching the web.

**Comparisons.** Compare two or more products or services side by side using community ratings, data point aggregates, and discussion sentiment.

**Referral links.** Retrieve community-trusted referral links for topics you ask about, ranked by your social graph — people you follow first.

**Personal context.** The agent will have access to your profile: the cards you've added to your portfolio, your spending categories, your reward program valuations, your household setup. Questions get answers in the context of your actual situation.

## Why Context Changes the Quality of Answers

The difference between a good AI answer and a great one is often context about who's asking.

"What's the best travel card?" is a bad question because the right answer depends entirely on your existing portfolio, your spending patterns, and your goals. ChatGPT gives you the same answer it gives everyone because it knows nothing about you.

Voucha Chat will know what you've told it. When you update your spending categories, add a card to your portfolio, or share your goals, that information persists across conversations. Follow-up questions build on what you've already shared.

This isn't a gimmick — it changes what answers are even possible. "Given my current cards, where am I leaving the most points on the table?" requires knowledge of your portfolio to answer specifically rather than generically.

## Security: Prompt Injection Prevention

Voucha Chat will handle external content — web pages, RSS items, user-submitted text — with explicit boundary separation between trusted instructions and untrusted data. External content is always treated as data, not as instructions the agent should follow.

This prevents a class of attacks where malicious content in a web page or feed item attempts to hijack the agent's behavior. Prompt injection is treated as a first-class threat, not an afterthought.

## How It Differs from General AI

|                             | Voucha Chat                          | ChatGPT / Perplexity    |
| --------------------------- | ------------------------------------ | ----------------------- |
| Retrieval corpus            | Community-verified data              | Open web                |
| Trust filtering             | Yes — domain, feed, user, content    | No                      |
| Personalization             | Your profile, portfolio, preferences | None (per conversation) |
| Data point access           | Structured aggregates                | Not available           |
| Referral links              | Social-graph ranked                  | Not available           |
| Bias from affiliate content | Filtered                             | Present                 |

Voucha Chat will be narrower in scope than general AI assistants — it's designed for product and service decisions, not for writing code or explaining history. Within that scope, the grounding in structured community data is what makes it more reliable than web retrieval.

This is where the trust network pays off. All the vouches, reviews, and data points people have contributed to Voucha become the foundation the AI builds on. The community isn't just using the product — they're making the AI better every time they contribute.

See also: [An AI That Only Answers from Sources You Trust](ai-chat-trust-filtered.md) for a deeper look at the trust-bounded AI concept.
