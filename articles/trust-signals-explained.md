---
title: 'How Trust Works on Voucha: Domains, Feeds, Users, and Content'
slug: trust-signals-explained
post_type: article
topics:
  - voucha
---

# How Trust Works on Voucha: Domains, Feeds, Users, and Content

Most platforms give you one trust signal: a checkmark, a star rating, a thumbs up. That single signal has to answer a complex question — should I trust this? — and it can't. A five-star Amazon review tells you nothing about whether the reviewer knows what they're talking about, whether the site hosting the review has a financial stake in it, or whether the source is reliable in this particular area.

Voucha measures trust at four separate layers, each answering a different question. Here's what each one means for what you actually see.

## Layer 1: Domain Trust

**The question it answers:** Is this website, as a whole, a reliable source?

Domain trust is the broadest layer. When content comes from a specific domain, how much weight should it carry by default? A domain with high community trust has been consistently rated reliable by real users. A domain with low trust has been flagged as unreliable, biased, or misleading.

**How it's set:** Community voting. Users vote on whether they find specific domains trustworthy, and those votes are aggregated — weighted by each voter's own trust score.

**What it captures that a Google search ranking doesn't:** Traditional domain authority (Moz DA, Ahrefs DR) measures SEO strength — how well a site ranks in search. Community-voted domain trust measures something different: whether real humans who actually read the content found it reliable. A site can have excellent SEO and terrible trust, or minimal SEO and a strong track record.

**In practice:** When you encounter a link from an unfamiliar source, the domain trust score gives you an immediate baseline — not a verdict, but a useful starting point. A trusted domain can publish a bad article. A low-trust domain can occasionally produce something excellent. Think of it as a prior, not a judgment.

Here's what domain trust tends to capture across different source types:

| Domain Type                                | Typical Trust Pattern                                         |
| ------------------------------------------ | ------------------------------------------------------------- |
| Primary source data (government, academic) | High trust — original data, no commercial incentive           |
| Independent expert blog                    | High trust — deep knowledge, transparent perspective          |
| Major news organization                    | Moderate trust — professional standards, but editorial biases |
| Affiliate review site                      | Lower trust — commercial incentives create systematic bias    |
| Content farm / SEO site                    | Low trust — optimized for traffic, not accuracy               |

## Layer 2: Feed Trust

**The question it answers:** Is this specific RSS feed worth following?

Feed trust is more granular than domain trust. A single domain might publish multiple feeds — a news site might have a general feed, a technology feed, and an opinion feed. These can have very different track records. The technology coverage might be excellent while the opinion section is ideologically extreme. Feed-level trust captures that distinction.

**How it's set:** A combination of community votes on specific feeds and signals from subscriber behavior. Feeds that are widely subscribed to by high-trust users and consistently deliver content rated as valuable earn higher feed trust.

**In practice:** When you're deciding what to subscribe to, feed trust helps you tell the difference between different content streams from the same publisher. It also powers feed recommendations — when the system suggests new feeds based on your interests, it prioritizes quality over quantity.

## Layer 3: User Trust

**The question it answers:** Does this person contribute quality content and reliable evaluations?

User trust is earned through consistent, quality participation over time. Users who vote on domains in ways that align with eventual community consensus, share content others find valuable, and submit accurate data earn higher trust scores.

**How it's built:** A track record based on:

- Consistency of domain trust votes with broader community consensus
- Quality of content contributions (as evaluated by other users)
- Accuracy of structured data contributions
- Duration and consistency of participation

**Why it matters:** User trust is the foundation everything else runs on. Domain and feed trust scores are computed from aggregated user votes, weighted by the voter's user trust. A trust vote from someone with a strong track record carries more weight than one from a new or unreliable account.

User trust also shapes your personal experience. When you follow someone with high user trust, their reading activity and domain evaluations carry real weight in your feed.

**Starting out:** New users start with a baseline trust score. Trust is earned gradually through participation. This creates a natural defense against gaming — even if bad actors create accounts, they can't immediately influence trust scores. They'd need to spend significant time contributing genuinely useful evaluations before earning meaningful influence. At which point they've probably become genuine participants.

## Layer 4: Content Trust

**The question it answers:** Is this specific piece of content — this review, this data point, this claim — trustworthy?

Content trust is the most granular layer. It evaluates individual contributions, not their sources. A trusted user posting on a trusted domain can still submit inaccurate data. Content trust captures that.

**How it's set:** Community evaluation of specific content items, weighted by the evaluator's user trust. For structured data like product reviews or credit card comparisons, content trust also incorporates consistency checks — does this data point align with other verified data about the same product?

**In practice:** When you're reading a specific review or looking at specific data about a product, content trust tells you how confident the community is in that particular piece of information. This is what lets you actually rely on crowd-sourced data for real decisions — you can see not just the data, but how much the community trusts each piece of it.

## How the Four Layers Work Together

The layers aren't independent. They reinforce each other.

**Trust flows upward:** Content trust rolls up into user trust (users who consistently contribute trusted content earn higher scores), which rolls up into domain and feed trust (votes from high-trust users carry more weight).

**Trust flows downward:** Domain trust provides a starting point for content trust (content from a trusted domain starts with a higher baseline). User trust does the same for content evaluation (contributions from trusted users are given more initial credence).

**Cross-layer signals flag things worth investigating:** When content from a low-trust domain is submitted by a high-trust user, or when a high-trust domain publishes something that low-trust users are enthusiastically sharing, those cross-layer patterns are worth a closer look. They often signal something unusual.

The compound effect is greater than any single layer. A single trust layer can be gamed — you can build backlinks to inflate domain authority, or create fake reviews to boost ratings. Gaming multiple independent layers simultaneously is much harder, because each layer uses different signals with different manipulation vectors.

## Using Trust Signals in Practice

**Start with domain trust.** When you encounter an unfamiliar source, check its domain trust score for a quick read on community reliability.

**Build your social graph deliberately.** Follow people whose evaluations you've found reliable. Their trust votes and reading activity progressively shape your feed.

**Contribute your own evaluations.** Vote on domain trust. Rate content. Your trust score grows as you contribute consistently, and your evaluations influence what your network sees.

**Pay attention when signals disagree.** Trusted domain but low content trust on a specific article? Low-trust domain shared by high-trust users? Those divergences are usually worth a closer look.

Trust signals are probabilities, not verdicts. They give you better inputs for your own judgment — in a web where everything is trying to persuade you of something, better inputs are worth a lot.
