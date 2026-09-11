# Research Agent

A subagent that researches personal finance topics — credit cards, rewards programs, approval odds — by querying multiple data sources.

## Overview

The research agent is a [subagent tool](../_shared/subagent-tool.mts) invoked by the chat orchestrator when a user asks a question requiring multiple searches or deep analysis. It runs an internal `runToolLoop` with up to 10 iterations and returns a synthesized text summary.
Delegated `query` and `context` inputs are sanitized and wrapped before the inner model call so
conversation text is treated as data, not instructions.

## When to Use

The chat orchestrator delegates to this agent when:

- The user asks a broad question: "find the best credit card for me", "which travel card should I get?"
- Deep research is needed: approval odds, credit limits, community reviews, editorial content
- Multiple data sources need to be cross-referenced

## Tools Available

| Tool                                       | Purpose                                          |
| ------------------------------------------ | ------------------------------------------------ |
| `search_topics`                            | Look up card/product topic IDs by name           |
| `get_topic_details`                        | Card attributes: annual fee, issuer, brand       |
| `get_topic_hierarchy`                      | Parent/child topics — find all cards from issuer |
| `get_topic_metrics`                        | Engagement counts and ratings for a topic        |
| `search_data_points`                       | Real approval odds, credit limits from users     |
| `get_topic_insights`                       | Aggregate statistics for a card                  |
| `compare_topics`                           | Side-by-side card comparison                     |
| `get_referral_links`                       | Referral links for recommended cards             |
| `search_posts`                             | Community discussions and reviews                |
| `search_crawls` / `search_crawls_semantic` | External web content                             |
| `search_rss_feed_items`                    | Recent articles                                  |
| `get_wikipedia_summary`                    | Background context                               |

## Observability

Each research agent invocation creates a `conversation_message_agentic_runs` row with `parent_agentic_run_id` pointing to the chat orchestrator's run. All tool calls and model responses are logged as events on this child run.

## Adding a New Tool

1. Import the tool in `tool.mts`
2. Add it to the `toolEntries` array in `createSubagentTool`
3. Update the system prompt in `build-system-prompt.mts` with usage instructions
4. Update this README's tools table
