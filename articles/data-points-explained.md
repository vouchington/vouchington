---
title: 'Real Numbers From Real People: What Data Points Are and Why to Submit Yours'
slug: data-points-explained
post_type: article
topics:
  - voucha
---

# Real Numbers From Real People: What Data Points Are and Why to Submit Yours

When you're deciding whether to apply for a credit card, you don't want an affiliate site's "should you apply?" calculator. You want to know: what credit score did people actually get approved with? What credit limits did they receive? What's the real approval rate for people who look like you?

That's what Data Points are. Not opinions — actual outcomes, captured in typed fields so they can be added up.

## What a Data Point Looks Like

On Reddit, someone might write: "I was approved for the Sapphire Preferred with a 750 score and 2 inquiries." Useful if you happen to find it. Impossible to search by credit score range, impossible to aggregate, impossible to count approval rates from.

On Voucha, the same information goes into structured fields:

| Field                      | Value                    |
| -------------------------- | ------------------------ |
| Card                       | Chase Sapphire Preferred |
| Result                     | Approved                 |
| Credit score range         | 750-799                  |
| Hard inquiries (12 months) | 2                        |
| Cards opened (24 months)   | 3                        |
| Application method         | Online                   |
| Credit limit               | $12,000                  |

Every field is typed and queryable. The card name links to a canonical topic (no misspellings to reconcile). The result is a fixed choice, not free text. Put 200 of these together and you can calculate what you actually need to know.

## What You Can Learn From 200 Data Points

Individual data points are useful. A lot of them together is genuinely different.

When a credit card topic has enough data, Voucha can show you:

- **Approval rate by credit score range** — What percentage of applicants in each score bracket were approved
- **Credit limit distributions** — What limits are being granted, segmented by score and income
- **Trend data** — Whether approval rates are tightening or loosening over time
- **Application method comparisons** — Whether online, in-branch, or phone applications have different outcomes

For hardware, the same approach produces:

- **Failure rates by ownership duration** — What percentage of units fail at 6, 12, or 24 months
- **Real-world performance metrics** — Actual FPS, battery life, transfer speeds from owners
- **Recommendation rates** — What percentage of owners would actually buy it again
- **Price distributions** — What people are actually paying across retailers

For AI tools:

- **Switch patterns** — Migration flows between tools (who's moving from X to Y and why)
- **Usage duration** — How long people stick with a tool before switching
- **Ratings by use case** — Whether a tool excels for coding but falls flat for writing
- **Satisfaction distributions** — Not just average ratings but the full spread

None of this comes from free-text reviews. It requires consistent structured contributions from many people.

## What You Get From Submitting Yours

Contributing isn't purely for the community's benefit. There are real personal returns:

**A record of your own history.** Your submitted data points form a personal reference — when did you apply for that card? What was your credit score at the time? When did your laptop's GPU start having problems? Useful to have when you're applying for something new and trying to remember your history.

**A stronger trust profile.** Every accurate data point you submit builds your standing on the platform. Higher trust means your reviews rank higher, your referral links get priority, and your contributions carry more weight in community aggregates.

**Helping people who follow you.** When you submit a data point, the people in your network see it. Your approval result for a credit card might be exactly the signal a friend needs to decide whether to apply.

## How to Submit One (About 30 Seconds)

1. **Navigate to the topic** — Find the product page or create a new post
2. **Select "Add Data Point"** — This opens the submission form
3. **Fill in the required fields** — These vary by category:
   - Credit cards: card name, result, credit score range
   - Hardware: product, ownership duration, would recommend
   - AI tools: tool name, use case, usage duration, rating
4. **Add optional fields** — More detail makes your data point more useful: income range, inquiry count, failure description, real-world metrics
5. **Include notes** — Free-text context for anything the structured fields don't capture ("recon call successful after initial denial", "GPU artifacts started after firmware update")
6. **Submit**

Your data point is immediately visible and included in aggregate calculations.

## How Voucha Keeps the Numbers Honest

Real numbers only matter if they're reliable. A few things that keep the data clean:

**New accounts are verified in.** Accounts less than 30 days old are flagged as unverified contributors — their data points are visible but excluded from aggregate calculations until the account ages in. Accounts with 30+ days and 3+ data points become verified contributors with full weight. There's also a trusted contributor tier with enhanced weight for sustained contributors.

**Small samples say so.** Aggregates aren't displayed until there's enough data to mean something — 10 data points for approval rates, 15 for failure rates, 20 for distribution charts. Below those thresholds, Voucha says "Not enough data yet" rather than showing you numbers from 4 people.

**Confidence intervals are shown.** Every aggregate value shows the confidence interval based on sample size. A 73% approval rate from 500 data points means something different than a 73% approval rate from 12 data points. You can see the difference at a glance.

**Outliers get flagged.** A credit limit report of $500,000 on a card that typically grants $5,000–$20,000 gets flagged for verification, not silently averaged in.

**Recent data counts more.** Older data points matter less to aggregates than recent ones. A credit card approval from two years ago is less useful to today's applicant than one from last month. The 30-day half-life ensures aggregates reflect current conditions.

## Which Optional Fields Matter Most

If you can spare an extra 15 seconds beyond the required fields, some optional fields are especially useful:

For credit cards, **income range** and **hard inquiries** are the most valuable. They enable segmented approval rates that help applicants with similar profiles assess their real odds.

For hardware, **failure status** and **real-world metrics** are crucial. "Would recommend" without ownership context is just an opinion. "Would recommend, 18 months of ownership, no failures" is data.

For AI tools, **switched from/to** fields power the migration flow analysis that shows actual adoption patterns — not which tool is most hyped, but which one people actually keep using.

Every data point moves the numbers closer to real. Submit yours.
