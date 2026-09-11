# Autotagger

LLM-based auto-categorization of posts and RSS feed items into topics.

## Overview

The autotagger service uses an LLM agent (the "autotagger" system user) to automatically tag posts and RSS feed items with relevant topic categories. It stores tagging results with content SHA-256 hashes for deduplication and tracks which prompt version produced each result.

## Key Files

- `check.mts` — Checks if a post or RSS feed item has already been autotagged (`hasExistingPostAutotagging`, `hasExistingRssFeedItemAutotagging`)
- `upsert.mts` — Inserts autotagging results with topic associations, using upsert semantics and CTE-ordered deletes/inserts for atomicity
- `prompts.mts` — Retrieves the active autotagger prompt from the agents system
- `types.mts` — `PostAutotagResult` and `RssFeedItemAutotagResult` type definitions

## Architecture Notes

- Results are stored in `post_autotagger_results` and `rss_feed_item_autotagger_results` tables with associated topic junction tables
- Content hashing (SHA-256) enables skipping re-tagging for unchanged content
- Topic IDs are deduplicated before insert
- Prompt versioning is tracked per result, enabling re-tagging when prompts change

## Related

- Agent system: [backend/services/agents/README.md](../agents/README.md)
- Entity relations (post-topic tagging): [backend/services/entity-relations/README.md](../entity-relations/README.md)
- System users: [`backend/services/users/system-users.mts`](../users/system-users.mts)
