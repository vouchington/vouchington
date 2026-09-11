# Profile Agent

A subagent that manages a user's financial profile — wallet cards, spending categories, point valuations, rewards statuses, and financial data.

## Overview

The profile agent is a [subagent tool](../_shared/subagent-tool.mts) invoked by the chat orchestrator when a user wants to make profile changes. It runs an internal `runToolLoop` with up to 8 iterations, always checking current state before making changes, and returns a summary of what was done.
Delegated `task` and `context` inputs are sanitized and wrapped before the inner model call so
conversation text is treated as data, not instructions.

## When to Use

The chat orchestrator delegates to this agent when:

- The user wants to add, update, or remove cards from their wallet
- The user wants to update spending categories, point valuations, or rewards statuses
- Multiple profile changes are requested in a single message
- Financial profile details need updating (credit score, income, etc.)

## Tools Available

| Tool                          | Purpose                                       |
| ----------------------------- | --------------------------------------------- |
| `get_my_profile`              | Retrieve current wallet and financial profile |
| `manage_my_cards`             | Add, update, or remove wallet cards           |
| `manage_my_point_valuations`  | Set rewards program point values              |
| `manage_my_rewards_statuses`  | Track loyalty tier statuses                   |
| `manage_my_spending`          | Track monthly spending by category            |
| `update_my_financial_profile` | Update credit score, income, credit limits    |
| `search_topics`               | Look up card topic IDs by name                |

## Observability

Each profile agent invocation creates a `conversation_message_agentic_runs` row with `parent_agentic_run_id` pointing to the chat orchestrator's run.

## Adding a New Tool

1. Import the tool in `tool.mts`
2. Add it to the `toolEntries` array in `createSubagentTool`
3. Update the system prompt in `build-system-prompt.mts`
4. Update this README's tools table
