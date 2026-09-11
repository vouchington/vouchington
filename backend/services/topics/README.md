# Topics

## Topic Types

These are topic types that are mutually exclusive to each other and are thus set on `topic.topic_type=`:

- `topic` - default/generic type
- `person` - an individual person (default for blogs without a known brand or public identity)
- `public_figure` - a notable person: influencer, celebrity, politician, etc.
- `organization` - a company, non-profit, or institution
- `brand` - a brand name: DBA, sub-brand (e.g. Chase Sapphire), or individual brand (e.g. Doctor of Credit)
- `referral_program` - a referral program to share referral links
- `rewards_program` - a rewards program, e.g. Hyatt World of Hyatt
- `rewards_program_status` - a status in a rewards program, e.g. Globalist in World of Hyatt
- `card` - a credit/debit card
- `bank_account` - a bank account product

Reviews are disabled for `person` topics. All other types support reviews.

## Topic Extensions

These are similar to topic types, but are not mutually exclusive and thus are not set as a `topic.topic_type=`:

- `spending_category` - adds information specific to a spending category, but these are not mutually exclusive to the types above. For example, World of Hyatt can be a spending category and a rewards program
- `retailer` - marks a topic as operating in retail (e.g. sells products). Only applicable to `brand` and `organization` topics. Managed via `topics__retailers` and `retailer_countries`.

## Topic Links to Programs

Any topic can link to a referral program or rewards program via nullable foreign key columns on the `topics` table:

- `topics.rewards_program_id` - nullable foreign key linking to a rewards program topic
- `topics.referral_program_id` - nullable foreign key linking to a referral program topic

These columns replace previous extension table patterns (`topics__cards`, `topics__referral_programs`, etc.) and allow topics to directly reference programs without requiring dedicated extension tables.

## Topic Authority

- A topic may link to one **primary** hostname through `topics.hostname_id`. For non-`rss_feed` topics (brand, organization, card, etc.), the hostname mirrors the back-reference through `url_hostnames.topic_id` — meaning the entire domain belongs to that topic. `rss_feed` topics set only `topics.hostname_id` (display linkage) and never claim `url_hostnames.topic_id`, because an RSS feed is URL-path-scoped, not domain-scoped.
- Use the topic-hostname helpers when changing domain authority so both sides stay synchronized in one transaction.
- Topics may have multiple parent topics through the `topic -> parent -> topic` entity relation, but the hierarchy must remain acyclic.
- Public topic pages aggregate sources and domains from the current topic plus all descendant topics.

### Hostname String Resolution

`createTopic()` and `updateTopic()` accept `hostname` as a plain string (e.g. `"thepointsguy.com"`) or UUID. The service resolves the string to a `url_hostnames` record via `upsertUrlHostnames()`, creating the hostname if it doesn't exist. Pass `null` to unlink the topic from its primary hostname.

### Additional Hostnames

Topics may have zero or more **additional hostnames** beyond the primary `topics.hostname_id`. Additional hostnames reuse the existing `url_hostnames.topic_id` column — the unique index was replaced with a non-unique one so many hostnames can share the same `topic_id`. The primary is identified by `topics.hostname_id`; all others with `url_hostnames.topic_id = topicId` are additional. Each hostname may only belong to one topic at a time.

Hostname strings are normalized (trimmed and lowercased) and validated before upserting.

Service functions in [`backend/services/topics/additional-hostnames.mts`](additional-hostnames.mts):

- `getAdditionalHostnames(topicId, { limit?, after? })` — id-keyset-paginated list of additional hostnames (excludes the primary); returns `{ results, hasNextPage }`
- `addAdditionalHostname(topicId, hostname, userId)` — normalize, resolve/create hostname, and set `url_hostnames.topic_id` (409 if already claimed by another topic)
- `removeAdditionalHostname(topicId, hostnameId)` — clear `url_hostnames.topic_id` (404 if not an additional hostname for this topic; the primary cannot be removed this way)

API: `GET/POST /api/v1/topics/:id/additional-hostnames`, `DELETE /api/v1/topics/:id/additional-hostnames/:hostnameId` (admin-only).

## Topic Alias Merges

`mergeTopicAliases()` is the admin-only topic consolidation path. It does not delete topics and it
does not move posts, follows, RSS feeds, ratings, relations, or community list items.

The merge transaction:

- Moves all `topic_aliases` rows from the source topic to the destination topic.
- Adds the source slug as a destination alias.
- Marks the source topic with `merged_into_topic_id`, `merged_at`, and `merged_by_id`.
- Refreshes denormalized `topics.aliases` for both source and destination.

After commit, the service invalidates source/destination topic caches, adds moved aliases to the
topic lookup bloom filter, and enqueues topic-alias and topic-updated side effects. Normal topic
lists and searches exclude merged source topics, while source identifiers resolve to the destination.

Topic deletion is intentionally unsupported. The `DELETE /api/v1/topics/:idOrSlug` route returns
`405`; new code should use alias merges instead.

## Related

- [backend/api/v1/topics/README.md](../../api/v1/topics/README.md)
- [backend/queues/bedrock-embeddings/README.md](../../queues/bedrock-embeddings/README.md)
- [docs/requirements/content/TOPICS.md](../../../docs/requirements/content/TOPICS.md)
