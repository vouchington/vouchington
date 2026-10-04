# PostgreSQL Schema Quality Rules

Defect classes surfaced by SQL review that are easy to reintroduce. These are authoritative agent
rules; the terse pointer lives in [backend/data-stores/psql/AGENTS.md](../../backend/data-stores/psql/AGENTS.md).
Each rule links the tracking issue for its static-analysis guard / fix.

## Prelaunch relational storage

Voucha has not launched. Change the canonical schema creators and current callers together, then
rebuild disposable databases. Migrations still provide deterministic fresh installation, a ledger,
checksum verification, transactional execution, and current seeds/views. They are not a sequence of
upgrade deployments to preserve historical app contracts. Do not add backfills, dual writes,
compatibility readers, or activation stages for old application versions. Keep external protocols,
security key rotation, and exact replay envelopes where those contracts actually require them.
Launch behavior and worktree-database recovery follow
[One current contract](../../AGENTS.md) and
[Ephemeral worktree databases](../../AGENTS.md).

An internal entity reference is a column or child row with a concrete foreign key and a supporting
index, including a reference stored in a primary or unique key. Extract that id from a JSON document
(other than change history, below) or a UUID array. Leave the rest of the document in JSON. Do not delete a JSON document and replace
it with a typed column for every field.

Structured documents stay JSON. Data points stay structured JSON. A data-point field that references
an entity, such as a topic id, is a foreign-key column. Counts, amounts, and the other structured
fields stay in the JSON.

Change history stays JSON. Do not extract before/after values, and do not add foreign keys for ids
that appear only in a history document. History is for tracking and is not joined. Revision `changes`
documents and config or prompt previous/next field documents are history.

Live references point at live tables. An entity that must remain referenceable after deletion has its
own retained-identity row. Durable rows that outlive the entity reference that row. A retained
identity does not authorize a deleted entity. Keep only the identity and lifecycle fields that
existing retention needs. Model alternatives as per-entity FK columns with an exact-one-target
constraint or as typed child rows. Do not use a UUID array, type/id pair, generic attribute/value
table, or encoded string key as relationship storage.

The canonical user, topic, post, RSS-item, and API-key creators register their concrete retained identity
inside the live-row insertion transaction. Live rows FK back to that owner; deletion may remove the
live row while a request, audit record, or publication bridge keeps the owner. Root reservation is
not proof that the live entity exists or that an operation is authorized. The independent bounded
[retained-identity cleanup](../overview/architecture/services/data-retention/README.md#key-exports) removes
an owner only after its live row and every durable reference have gone; audit rows have no inferred
expiry.

Image delivery repair retains a concrete image identity and an immutable placement binding with an
exact post or surface family. The owner transaction creates that binding, pins the image root and
the binding in that order, then inserts the live placement. A repair marker references an already
committed registry delivery key; it is not a direct pin of a reservation made before the owner
transaction. Live image and placement rows, registry records, and repair markers use concrete FKs,
but retained identity alone never grants delivery. Scheduled bounded cleanup removes an orphan
binding after its last live, registry, and marker reference, then removes an unreferenced image
root in a separate sweep.

Elected relation history uses 17 metadata-derived `retained_relation__*` identity owners, each
keyed by the authoritative `(subject_id, id)` pair and FK-linked to its concrete subject root.
Only the actual vote `DELETE RETURNING` tuple may reserve one for user-deletion work; neither a
candidate nor a later live-relation lookup proves the deleted target. Typed, exact-one impact
columns FK to those pairs, and pending relation effects FK to an impact in the same deletion
request. The owners are unpartitioned: they contain only active deletion-work identities, not
permanent copies of live relation rows; composite-key and target indexes keep access selective.
Reconsider partitioning at sustained one-million-row cardinality or measured pressure. A bounded
relation-identity sweep removes each owner once no impact references it, even if the live relation
still exists. The subsequent root sweep also checks all 17 retained-relation references.

JSON that stays includes structured application documents, change history, exact reviewed opaque
provider documents, external protocol payloads, and replay envelopes. The
[relational-storage catalog](../../static-code-analysis/repo-file-policy/relational-storage-catalog.mts)
records reviewed opaque columns, non-relationship UUID tokens, and the two reviewed id categories
below. There is no debt inventory: every UUID array, missing foreign key, or encoded key fails the
guard unless a reviewed catalog entry covers it, and a UUID array has no catalog exception. A
catalog entry whose column no longer has the defect is stale and must be removed.

Two reviewed categories need no foreign key, and each catalog entry is an exact `table.column` with
a one-line reason. A **token, cursor or protocol identifier** is an opaque id with no owning row to
reference: a client device or session token, an ActivityPub activity id, a traversal cursor, or a
provider idempotency key. An **audit snapshot identifier** is an id recorded at write time and never
joined for authorization; it must outlive its source row, so a foreign key would either block the
source's deletion or erase the record. An id that authorizes, or that can dangle without an audit
reason, still takes a foreign key. Entering either category needs plan review.
The
[schema guard](../../static-code-analysis/repo-file-policy/relational-storage-guard.mts) runs on the
committed PostgreSQL-generated snapshot. It rejects unresolved domain types before UUID-array and
relation classification. A JSON column is not a defect. The guard cannot see an id hidden inside a
document; review of the producer and consumer does that. Naming checks catch reference-like UUIDs,
scoped encoded keys only while they stay textual, and sole UUID primary keys that are neither
generated nor foreign-keyed. A generated alias is accepted only with its exact source expression,
each source foreign key, and the exact `num_nonnulls(...) = 1` check. Valid composite foreign keys are accepted directly from the committed snapshot.

## Schema review decision record

The [prelaunch schema review plan](https://github.com/vouchington/vouchington/issues/1583#issue-description) owns decisions 1–23 and their implementation phases. R1–R7 below are the design
contract; the linked phases apply these rules to existing schema and callers. Examples describe
the approved target names and shapes, including changes that have not landed yet. Counts in these
examples describe the review baseline, rather than the current generated snapshot.

## R1 — Names explain the stored thing, in full words

- Tables are plural snake_case and read as `<owner>_<thing>s`: `hostname_crawler_configurations`,
  not `crawlers`. Only the last word is plural (`user_role_types`, not `user_roles_types`).
  `rewards` is a compound-noun token ("rewards program" is the domain and API v1 term), so
  `rewards_program_*` names stay. `copyright_eu_statements_of_reasons` merges into
  `copyright_territorial_decisions` (decision 18); the EU Digital Services Act term lives on as
  the label for EU rows.
- **One-word table names are for core entities only** (`users`, `posts`, `topics`, `communities`,
  `individuals`, `households`, …), each with a reviewed `allow` entry. Any other table names its
  owner and its thing:
  - `crawlers`→`hostname_crawler_configurations` (`crawls.crawler_id`→`hostname_crawler_configuration_id`)
  - `boilerplate_removals`→`hostname_path_boilerplate_removals`, and its child
    `boilerplate_removal_urls`→`hostname_path_boilerplate_removal_urls`
  - `lists`→`user_lists` (parallel to `community_list_*`)
  - `rss_feed_item_ids`→`rss_feed_item_guids` (one row per hostname and GUID; its id is the item id)
  - `referral_program_link_validations`→`referral_program_link_validation_rule_sets`
  - `domain_blacklists` (one row per domain)→`blocklisted_domains`, with
    `domain_blacklist_sources`→`domain_blocklist_sources`, `source_id`→`domain_blocklist_source_id`
    and `domain_blacklist_types`→`domain_blocklist_types`
  - `ap_posts` (a per-post like tally)→`post_activitypub_like_tallies`, with `ap_likes_*`→`likes_*`

  The personal-finance tables keep their names (`individuals`, `households`, `individual_*`),
  because the feature won't always be finance-only. `sites` is deleted: nothing references or
  reads it, and only its seed `INSERT` touches it.

- **Base names use full words.** Tables, columns, functions and enums have no longer name to check an
  abbreviation against, so a denylist bans the known ones, each with its replacement:
  - `ap`→`activitypub`, `og`→`open_graph`, `ses`→`amazon_ses`, `mod`→`moderator`,
    `mipr`→`membership_ineligible_purchase_reversal`, `op`→`operation`, `ack`→`acknowledgment`
  - `pct`→`percent`, `ms`→`milliseconds`, `hn`→`hacker_news`, `lang`→`language`,
    `config`/`cfg`→`configuration`, `rel`→`relation`
  - index-suffix words: `uid`→`user_id`, `pos`→`positive`, `pub`→`published`,
    `conv`→`conversation`, `msg`→`message`, `uniq`→`unique`, `fk`→`foreign_key`

  Standard acronyms stay (url, rss, api, ip, s3, dns, sha, uri, utm, pem, arn, did, sku, eu, uk, ai,
  llm, faq, css, ui, mta, xip, v1, txt). `activitypub_distribution_checkpoints` (becoming
  `activitypub_distribution_work_items`, decision 17) already uses the long form, next to `ap_*`.

  When the full words would push a name past 63 bytes, choose a shorter name made of full words; don't
  abbreviate. For example, `fn_reject_mipr_case_op_context` becomes
  `fn_require_purchase_reversal_case_operation_context`, not a 73-byte full expansion.

- Index names are `idx_<table>__<suffix>`, where `<table>` is the index's own table and `__`
  separates it from the suffix. A UNIQUE index may use `uq_<table>__<suffix>` instead; `uq_` on a
  non-unique index is an error. The suffix is free text (`__active`, `__trending`,
  `__account_id__id`) and uses no denylisted word.
- **`<table>` may be abbreviated, as long as it expands.** Every word of the table name must be
  present, in order, with the same `_`/`__` separators. Each shortened word:
  - keeps its first letter;
  - keeps at least 3 letters (a word of 1–3 letters stays whole);
  - keeps its letters in the order they appear in the real word.

  Examples:
  - Valid: `comm_app_answers` for `community_application_answers`; `ord_line_itms` for
    `order_line_items`.
  - Errors: an initialism (`cli` for `community_list_items`); a dropped word
    (`copyright_notice_intents` for `copyright_notice_action_intents`); a word under 3 letters
    (`comm_app_q`).

  A shortened word must not be a denylisted token, even though it expands: `user_mod_notes` for
  `user_moderator_notes` is an error because `mod` is denied, so spell that word out.

  Abbreviating is allowed at any length. NM-4 `postgres-identifier-length` (jonathanong/no-mistakes#1058) still rejects names over 63 bytes. Today 1,125 of
  1,398 non-constraint indexes use the full table name, and 20 use an abbreviation that expands; 8 of
  those use a denylisted word (`conv`, `msg`, `pub`).

- In table names, `__` has one meaning: generated entity-relation tables
  (`relation__<s>__<verb>__<o>`, and `retained_relation__…`). Everything else uses plain names:
  - **Subtype extensions** (pk = the parent's id; each row _is_ a topic, agent or post of that
    kind) are `<subtype>_<parent>s`:
    - `topics__cards`→`card_topics`
    - `topics__fediverse_instances`→`fediverse_instance_topics`
    - `topics__referral_programs`→`referral_program_topics`
    - `topics__retailers`→`retailer_topics`
    - `topics__rewards_programs`→`rewards_program_topics`
    - `topics__rewards_program_statuses`→`rewards_program_status_topics`
    - `topics__spending_categories`→`spending_category_topics`
    - `agents__moderators`→`moderator_agents`
    - `post__stories`→`story_posts`

    A 1:N child table stays `<parent>_<thing>s` (`topic_aliases`), so the two can be told apart.
    FKs into an extension are named for it under R2:
    `hostname_crawler_configurations.referral_program_id` and
    `user_referral_program_links.referral_program_id` become `referral_program_topic_id`,
    `retailer_countries.retailer_id` becomes `retailer_topic_id`, and so on. The join table
    `topics__referral_program_link_validations` becomes
    `referral_program_topic_link_validation_rule_sets`.

  - **Per-target item tables** stay one table per target type:
    - `community_list_items__{posts,rss_feeds,topics,url_hostnames,urls}`→`community_list_{posts,rss_feeds,topics,url_hostnames,urls}`
    - `list_items__{posts,rss_feed_items}`→`user_list_{posts,rss_feed_items}` (`list_id`→`user_list_id`)

    One table per target works like a partition by type. Each table has its own indexes and
    `order_index` sequence, and needs no partial-index predicates. Every reader already queries
    one type, through the storage catalogs (`community-list-item-storage.mts`,
    `lists/catalog.mts`). The one mixed read, `view_list_items` (becoming `view_user_list_items`, with
    `list_item_types`→`user_list_item_types`), stays a `UNION ALL`. Each
    family's copies must keep identical columns, which an NM-10 `postgres-table-shape` (jonathanong/no-mistakes#1064) shape enforces (§5 5c).
- Vendor or model names appear only where the stored data is bound to that model (the
  `bedrock_nova_multimodal_v1_*` vectors). Record the reason in the table comment.
- One spelling per word (`acknowledgment`, as the majority already spells it). One term per concept:
  `blocklist` and `allowlist`, never `blacklist` or `whitelist` (the repo already says "allowlist").

## R2 — Columns say their type and target

- `timestamptz` columns end in `_at` (1,303 of 1,308 already do). The 5 others:
  `ap_inbox_deliveries.deferred_until`→`earliest_retry_at`,
  `community_activity_digest_dispatch_windows.window_start`/`window_end`→`window_starts_at`/`window_ends_at`,
  `queue_reconciliation_checkpoints.completed_through`→`reconciled_through_at`, and
  `ses_bounce_events.ses_timestamp`→`occurred_at` (the R4 `_events` shape).
- `date` columns are named `day` or end in `_on`: `individual_rewards_program_statuses.since`/`until`
  →`started_on`/`expires_on`, and their API v1 fields rename with them.
- Booleans read as a predicate: the name starts with `is_`, `has_`, `can_` or `should_`, or contains
  one after an underscore (`score_is_neutral`). About 51 columns are renamed (`enabled`→`is_enabled`,
  `accepted`→`is_accepted`, `follow`→`should_follow_imported_feeds`, `noindex`→`is_noindexed`,
  `livemode`→`is_live_mode`, …), and the API v1 fields rename with them. Names copied from an
  external payload get no exception, because the column is our own copy. Booleans that record an
  event may instead become `<verb>_at` under the existing "prefer lifecycle timestamps" rule; decide
  per column in the rename PR.
- An FK to `users` ends in `_user_id` (`actor_user_id`, `moderator_user_id`, `appellant_user_id`),
  except actor columns (who did something), which are `<verb>_by_id` (`created_by_id`,
  `resolved_by_id`). 276 columns and about 300 API v1 fields already use `_by_id`. The 11
  `<verb>_by_user_id` columns become `_by_id`, and the API field `accepted_by_user_id` becomes
  `accepted_by_id`. The suffixes are reserved: a `uuid` column ending in `_user_id` or `_by_id` is
  always an FK to `users` (or `retained_user_identities`).
- Every other FK column ends in its target's last word, singular: `individual_cards.card_id → topics`
  becomes `card_topic_id`, and `user_landing_page_items.review_id → posts` becomes `review_post_id`.
  Words the column's own table already implies may be dropped: `admin_import_rows.batch_id`
  (pointing at `admin_import_batches`) stays. Two cases also pass: a column named after a non-`id`
  referenced column (`github_user_id → github_accounts.github_user_id`), and `<x>_id` pointing at
  `retained_<x>_identities`.
- **A column with a fixed set of values is an enum type or a foreign key to a lookup table, never
  `text`/`varchar`.** Today ≈90 text columns are pinned to string literals by a CHECK (12 of them to
  a single value), and 13 more (`post_admission_reservations.{route,scope,source,…}`,
  `agent_moderations.moderation_transparency_category`, …) have no constraint at all.
  - **Enum** when the values are defined in code and change only with a migration plus a code
    change (almost every case here).
  - **Lookup table** (`<thing>_types` rows, FK column `<thing>_type_id` or the natural key) when
    rows carry attributes, or when new values arrive at runtime (`media_types`,
    `user_permission_types`, `user_role_types`).
  - Columns with the same values share one enum (12 groups today, e.g. the three
    `scope_category` columns and the transparency `category` rollups). Conditional state checks
    stay as CHECKs, comparing enum values.
  - A column pinned to one value (`legal_basis = 'copyright'`, `automation_disclosure = 'human'`)
    becomes a one-value enum, or it is dropped when nothing ever varies it; decide per column in
    the PR.
  - **Values an outside system defines** (it adds new ones without a migration) are stored by who
    sets them. An enum would reject a new value and lose the record.
    - A vendor we authenticate (`stripe_events.event_type`, `ses_bounce_events.bounce_sub_type`,
      `ai_usage_records.service_tier`, `verified_identities.document_type`): a lookup table that
      the writer fills on first sight, using the `upsertMediaTypes` pattern
      (`backend/services/urls/content-types.mts`: normalize, advisory lock, insert).
    - MIME types (the 3 copyright email/evidence `mime_type` columns and
      `rss_feed_items.enclosure_type`): an FK to the one MIME lookup table. `media_types`
      becomes `media_types`, because it no longer holds only URL content types. The writer checks
      the `type/subtype` syntax and length before inserting, since strangers set these values.
    - Values strangers set before we trust them (`ap_inbox_activities.activity_type`,
      `ap_inbox_deliveries.claimed_activity_type`): these stay `text` with a reviewed allow entry.
      A lookup table would let any sender create permanent rows.
    - A set a standard fixes (`ap_inbox_deliveries.request_method`, RFC 9110): an enum.
    - Free text (`oauth_authorization_requests.client_state`, `session_referral_attributions.utm_source`,
      `topic_claims.claimed_role`) and a lookup table's own key (`media_types.mime_type`) are not
      value sets; they get allow entries.
  - **A column never names a table.** A row that could belong to one of several tables goes in one
    table per target (R3, relation votes). State kept per relation is keyed by an enum generated
    from the same metadata as the relation tables.
- Enum names are plural like tables: only the last word is plural (`invoice_statuses`, not
  `invoice_status` or `invoices_statuses`). About 20 renames: the 20 singular names (the two
  `agentic_runs_*` enums left with the agentic-run storage). `verified_identity_statuses` is unused and deleted. The two duplicate
  pairs (`import_entity_types` = `import_entity_types`,
  `privacy_types` = `privacy_types`) merge when they mean the same thing.
- **Lifecycle timestamps are the facts; status is never stored beside them.** 10 tables store
  both, and the two have to be kept in sync by large CHECKs (a 5-branch CHECK ties
  `copyright_notice_delivery_intents.state` to 5 timestamps).
  - **Every row reaches a final state:** keep the timestamps, and make status an enum-typed
    `STORED` generated column,
    `GENERATED ALWAYS AS (CASE WHEN bounced_at IS NOT NULL THEN 'bounced' WHEN failed_at IS NOT NULL THEN 'failed' WHEN sent_at IS NOT NULL THEN 'sent' WHEN claimed_at IS NOT NULL THEN 'claimed' ELSE 'pending' END) STORED`.
    The CHECKs shrink to ordering rules (`num_nonnulls(sent_at, failed_at) <= 1`; `bounced_at`
    requires `sent_at`). A final state with no timestamp today gets one (`rejected_at`,
    `expired_at`, `stale_at`). A time-based state (`expires_at < now()`) can't be generated,
    because generation expressions must be immutable, so the sweeper writes `expired_at`.
    - Final: `copyright_notice_delivery_intents` (which also holds the one reply to each declined
      email intake), `notification_push_intents`, `notification_push_intent_subscription_receipts`.
    - Final, with a retry loop: `copyright_notice_action_intents` (`blocked`/`failed` → `pending`),
      `oauth_authorizations` (`exchanging` → `callback_received`), `post_admission_reservations`
      (`retryable_failed` → `in_progress`). The final outcomes become timestamps and a generated
      status. Each retry becomes a row in an `_attempts` ledger (R4) instead of rewinding the
      parent.
  - **Rows keep returning to earlier states (no final state):** the table becomes a history table
    (R4). Each attempt or change is an append-only row with its own final lifecycle, and current
    state is the latest row.
    - `copyright_notice_form_screening_attempts` retains one row per attempt.
      A restart appends the next attempt number and leaves the prior result and terminal facts
      intact.
    - `media_delivery_registry_records`: each desired-state change or republish advances
      `generation` and puts a completed row back to `pending`. Instead, each change becomes an
      append-only `_changes` row that keeps its sequence-assigned `generation` and has its own
      projection lifecycle. The current desired state is the latest change.
  - Not lifecycle status: `oauth_authorization_requests.state` is the opaque OAuth client value
    (RFC 6749), and it becomes `client_state`. The protocol parameter keeps its name.
    `users.verification_status` is not named `status`/`state`.
- **`updated_at` exists only on tables whose rows change, always with the `fn_update_updated_at`
  trigger, and code never writes it.** A table whose only allowed UPDATE erases an actor id
  counts as append-only. 86 tables have the column without the trigger, because
  `schema-static-analysis.test.mts` (`missing-updated-at`) requires `updated_at` on every table
  unless an allowlist entry exempts it. Invert that rule: a table without the column needs no
  reason, and a table with it needs the trigger.
  - Drop the column from 67 tables: 50 with a trigger that rejects UPDATE or allows only actor
    erasure (copyright legal records, classifier results, `agent_moderations`), and 17 that code
    only inserts (copyright evidence-retention previews and dispositions, `og_dependency_manifests`,
    `media_types`, …). Check each for readers of the column (API `updatedAt` fields) first.
  - Add the trigger to 19 tables: 16 whose writers set `updated_at` by hand today (10 through
    UPDATE, including `membership_source_states` and the 4 `*_cleanup_progress` tables; 6 through
    `ON CONFLICT DO UPDATE`), and 3 whose `updated_at` is wrong today because nobody sets it
    (`crawls`, `crawl_chunks`, `copyright_notice_guest_capabilities`).
  - Delete the explicit `updated_at = now()` / `CURRENT_TIMESTAMP` writes (89 runtime files). The
    trigger overwrites them, so they do nothing and wrongly suggest the code owns the value.
  - Some tables that get the trigger now write a chosen time, not `now()`:
    `post_admission_reservations` sets `updated_at = replay_deadline.now`
    (`admission-replay-retention.mts`), `terminal.committed_at` (`admission.mts`) and
    `observed_at.value` (`admission-lease-renewal.mts`). Once the trigger exists it replaces these
    values. Before deleting each write, check whether anything reads `updated_at` as that domain
    time. If something does, store it in a named column (`replay_deadline_at`, `lease_renewed_at`)
    and point the reader there.
  - The upsert `ON CONFLICT … DO UPDATE SET updated_at = copyright_notice_action_intents.updated_at`
    (4 files in `backend/services/copyright-notices/`) is meant as a no-op that makes `RETURNING`
    return the existing row. The table already has the trigger, so every conflict bumps
    `updated_at`. Replace it with `ON CONFLICT DO NOTHING` followed by a `SELECT` of the existing
    row, or with a CTE that does the same.

## R3 — Normalize: ids are FK columns, JSON is for schemaless data

This extends the prelaunch relational-storage rule.

- A reference is an FK column or an FK child row. It is never a UUID array, a type/id pair, or an
  id inside JSON. The exception is a history document (R4 `changes jsonb`), which records
  ids as they were when it was written.
- **A `uuid` column ending in `_id` belongs to a foreign key.** A single-column or a composite FK
  both count. Today (before the vote-table split) 72 columns have none. 69 of them don't point at a row that must exist, and
  each keeps its reason as a pattern exemption or an allow entry (NM-3 `postgres-column-naming` (jonathanong/no-mistakes#1057) `requireForeignKey`):
  - Cursors and high-water marks (18), which may point at a row that is already gone.
  - Fencing tokens (7): `processing_attempt_id` ×5, `oauth_authorizations.exchange_claim_id`,
    `post_admission_claims.lease_id`. Each is a random value per attempt. Phase 11 renames the 5
    `processing_attempt_id` columns and `lease_id` to `lease_token` (decision 16);
    `exchange_claim_id` stays, because it is a one-shot compare-and-set, not a worker lease.
  - Transparency-report community scopes (7), kept after the community is deleted.
  - OAuth audit event ids (5), which outlive the tokens, grants and clients they record.
  - Ids that live outside PostgreSQL (5): JWT device and session ids, and MFA login attempts. The
    14 vote-table `device_id`/`session_id` columns (46 after the vote-table split) are the same
    case, exempt by pattern.
  - Pre-allocated ids (5), reserved before the row they name exists, plus the 2 outbound
    ActivityPub activity ids on generated tables.
  - Natural keys (2).
  - Prompt revisions use `community_agent_prompt_id` → `community_agent_prompts` CASCADE.
    Prompt creator deletion uses SET NULL, so deleting the live creator does not destroy the
    community prompt or its history.
  - `curated_aside_items.entity_id`, a `STORED` `COALESCE` of concrete FKs (generated columns
    are skipped).
  - The former relation-vote parent needed two partition-only FK exceptions. The standalone
    relation-vote parents now expose their composite foreign keys in the snapshot and need no
    exception.
- **A ledger row that outlives its entity references that entity's retained identity.** The 3
  `membership_id` columns (`membership_changes`, `membership_refunds`,
  `membership_administrator_refund_operation_requests`) are NOT NULL with no FK. Deleting a user
  cascades their `memberships` rows away, while these rows survive through
  `retained_user_identities`, so their `membership_id` points at nothing. Add
  `retained_membership_identities`, registered by `fn_register_retained_identity()` on
  `memberships`, and FK the 3 columns to it with `ON DELETE RESTRICT`. It authorizes nothing about
  the deleted membership (psql `AGENTS.md`).
- **A reserved suffix names what it references.** `post_publication_dirty_work.author_user_id`
  points at `post_publication_author_identities` and becomes `author_identity_id`.
  `oauth_refresh_tokens.replaced_by_id` points at the table itself and becomes
  `replaced_by_token_id`.
- **One table per target; a column never names a table.** Relations and their votes each have one table per
  relation (`relation__<subject>__<verb>__<object>`). Votes use 17 standalone tables, `<relation table>__votes` (the longest is 53 bytes), each
  generated by `createEntityRelationVoteTable(metadata)`:
  - Columns: the `post_votes` core (`id`, `user_id`, `score`, `score_is_neutral`,
    `score_is_semantic`, `device_id`, `ip_address`, `session_id`, `user_agent_id`) plus
    `subject_id` and `entity_relation_id`, keeping today's names. The provenance flags default to false; existing binary voting
    producers and API behavior are unchanged. No table-name discriminator is stored.
  - `PRIMARY KEY (entity_relation_id, id)`, `PARTITION BY RANGE (entity_relation_id)` with a
    DEFAULT partition.
  - A table-level `FOREIGN KEY (subject_id, entity_relation_id) REFERENCES <relation table>
(subject_id, id) ON DELETE CASCADE`. The snapshot
    records it and NM-3 `postgres-column-naming` (jonathanong/no-mistakes#1057) sees it.
  - One advisory-lock key per concrete vote table in `votes-upsert.mts`.
  - Index names come from a helper: the full `idx_<table>__<suffix>` when it fits in 63 bytes,
    otherwise the NM-2 `postgres-object-naming` (jonathanong/no-mistakes#1056) behaviour-10 abbreviation, otherwise throw. The same helper fixes the 20
    relation-table index names that PostgreSQL formerly truncated
    (`0000-00-01b-entity-relation-indexes.mts`).
  - Readers that need every relation loop over the relation metadata. Where SQL needs one
    relation set, a generated `view_entity_relation_votes` is a `UNION ALL` of the 17 tables,
    each branch adding `'<relation table>'::elected_entity_relations AS entity_relation`. It has
    a comment.
- **State kept per relation is keyed by an enum generated from the same metadata.** The
  entity-relations generator emits `CREATE TYPE elected_entity_relations AS ENUM (…)`, one label
  per elected relation table name. `retained_relation_identity_cleanup_progress.entity_relation` uses
  `elected_entity_relations`. The cleanup job inserts its own row
  with `ON CONFLICT DO NOTHING` instead of throwing "Missing retained relation cleanup cursor",
  so no seed is needed. A new enum value can't be used in the transaction that adds it, so after
  launch, adding a relation adds the value in its own migration before anything uses it.
  NM-3 `postgres-column-naming` (jonathanong/no-mistakes#1057) `forbiddenColumnNames: (^|_)table(_name)?$` keeps table-name columns from returning; after
  this change nothing matches it.

- **Array columns.** `uuid[]` is never allowed. The element type decides everything else:
  - **A finite set is an enum array.** It follows the same rule as decision 8, and the enum type
    enforces membership, so `<@ ARRAY[...]` CHECKs go away (`cardinality(x) > 0` stays):
    - The 8 OAuth `scopes` columns and `api_keys.permissions` share one `api_scopes` enum, built
      from the scope catalogue in `backend/modules/scopes/`. `api_keys.permissions` is renamed
      `scopes`, because it holds the same values (`cards:read`), not `user_permission_types`.
    - `oauth_clients.grant_types` and `.response_types` become `oauth_grant_types[]` and
      `oauth_response_types[]`.
    - `post_publication_dirty_work.reasons` becomes `post_publication_reasons[]`. The coalescing
      upsert (`reasons || EXCLUDED.reasons`) stays as it is.
    - `post_clearance_changes.moderation_transparency_categories` becomes
      `moderation_transparency_categories[]` and shares the enum with the scalar transparency
      category columns (decision 8).
  - **References and URLs are child rows.** `post_topic_recommendations.landing_page_urls` becomes
    child rows pointing at `urls`.
  - **Values from outside, or free text**, stay `text[]`/`smallint[]` with a reviewed allow entry.
    They are ordered lists that reference nothing and that every reader loads whole:
    - protocol or vendor values copied whole: `oauth_clients.redirect_uris`,
      `user_passkeys.transports` (WebAuthn says to keep unknown values),
      `url_hostnames.web_risk_threat_types`. Decision 8b's first-sight lookup table applies
      to scalar columns, not to these.
    - configuration lists: the 4 CSS-selector and string lists on
      `hostname_crawler_configurations`, `referral_program_link_validation_rules.example_urls`
      (test inputs, never fetched), and `rss_feeds`/`url_hostnames.unreliable_status_codes`
    - `users.moderation_email_days_of_week`, which keeps ISO weekday numbers 1–7 and its CHECK,
      because `EXTRACT(isodow …)` returns the same numbers
    - `post_topic_recommendations.aliases`: user-proposed names, copied into `topic_aliases`
      on approval
  - **History snapshots** go into the history document: `topic_revisions.revised_by_roles` moves
    into the R4 revision document. Only the topic-revisions service reads it.
- **URLs that users publish or submit are stored in `urls` and referenced by a `<name>_url_id`
  FK.** They are written through `addUrls` (`backend/services/urls/upsert.mts`), which normalizes
  the URL, runs the Web Risk check (`assertUrlAllowedByWebRisk`) and rejects blocked hostnames. Pass
  `skipCreatedEvents: true` when the URL must not be crawled (referral trackers). The changes:
  - `user_landing_page_items.link_url` → `url_id`. Today `validateLinkUrl`
    (`backend/services/my/landing-pages/replace-items.mts`) checks only http(s), length and the
    fragment. A free-form landing-page link is therefore published with no Web Risk or blocklist
    check, while the table's other item kinds already go through `url_id`. Readers to update:
    `resolve-items.mts`, `replace-item-rows.mts`, `sitemaps/family-landing-pages-query.mts`.
  - `post_topic_recommendations.example_referral_link` → `example_referral_url_id`, stored with
    `skipCreatedEvents`, the same shape as `user_referral_program_links.url_id`.
  - `post_topic_recommendations.landing_page_urls` → child rows (see Array columns above).
  - `user_rss_feed_import_rows.canonical_url` is dropped. `recordRssFeedImportCanonicalUrl`
    (`backend/services/user-import-export/rss-feed-import-row-updates.mts`) writes it and nothing
    reads it. `rss_feed_id` already leads to the feed's own `url_id`.
- **A URL column stays `text` only with an allow entry that names its group** (26 today):
  - Protocol identifiers and capability URLs (15). Other systems compare these byte for byte, or
    holding one grants access, so normalizing them would break them: the 5 ActivityPub actor and
    inbox URIs, `bluesky_follow_records.record_uri`, the 3 OAuth `redirect_uri` columns,
    `oauth_clients.metadata_url`, the 3 Web Push `endpoint` columns,
    `membership_purchase_intents.provider_checkout_url`, `crawls.embed_oembed_url`.
  - Legal snapshots (3): the copyright `hosted_use_url` columns, kept exactly as the notice wrote them.
  - Raw input (1): `user_rss_feed_import_rows.input_url`, stored before validation.
  - Own-site analytics (1): `session_referral_attributions.landing_url`. It holds our own pages plus
    UTM parameters; `urls` would crawl them and add a row per UTM combination.
  - Configuration and evidence (2): `domain_blocklist_sources.url`, and
    `url_hostnames.web_risk_checked_url` (Web Risk's own record, which must not be re-checked).
  - Feed media (3): `rss_feed_items.thumbnail_url` and `podcast_shows.cover_art_url` (both shown
    through the `/sideload/` proxy), and `rss_feed_items.enclosure_url`. Moving them would roughly
    triple the `urls` rows and Web Risk calls from RSS ingest.
  - The registry itself: `urls.url`.
- **No column may duplicate a child table unless a trigger maintains it.**
  `topics.aliases text[]` is a copy of `topic_aliases`. It exists so the generated `search_vector`
  can include aliases, because a generated column can only read its own row. It stays as a derived
  search cache. A `fn_project_topic_aliases` trigger on `topic_aliases`
  (`AFTER INSERT OR UPDATE OR DELETE`) rewrites it, and the hand syncs are deleted: 2 migration
  `UPDATE … SET aliases` statements and 2 seed generators (`0005-00-01-seed-topics.mts`,
  `0080-00-01-publisher-type-topics.mts`). The column comment says it is derived, and the NM-6 `postgres-array-columns` (jonathanong/no-mistakes#1060)
  allow entry names the trigger.

## R4 — One shape per concept

| Concept                  | Canonical shape                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Suffix        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Field-diff history       | `id` uuidv7, `<entity>_id` FK, `revised_by_id` → users SET NULL, `revision_type` enum, `changes jsonb` in the `post_revisions` document format, append-only                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `_revisions`  |
| Typed lifecycle log      | `id` uuidv7, `<entity>_id` FK, `change_type` enum, `changed_by_id` → `retained_user_identities` RESTRICT, typed payload columns, append-only; time comes from `id`, not one timestamp column per state                                                                                                                                                                                                                                                                                                                                                                                                               | `_changes`    |
| Current state from a log | Latest `_changes` row, projected by one generic trigger (or a view). Never a hand-synced boolean per table                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | —             |
| Durable work queue       | `lease_token uuid`, `leased_at`, `lease_expires_at`, `attempt_count int`, `available_at`, `generation bigint` (only when re-enqueue can race), `completed_at` plus one timestamp per final outcome; status, if any, is a `STORED` generated column over them; retries are rows in an optional `_attempts` ledger (`attempt_number`), never a rewind of the item; every renew, complete or fail writes `WHERE lease_token = $mine`. The lease sits on a row that exists only for the work: the job row itself, or `<entity>_<job>_work_items` (pk = entity id, FK ON DELETE CASCADE) when the entity outlives the job | `_work_items` |
| Job cursor/progress      | One table per job; the pk names what each row sweeps (an enum), or `is_singleton boolean PRIMARY KEY DEFAULT true CHECK (is_singleton)` when the job sweeps one thing, never free text; `cursor_<thing>_id` keyset positions (or a `<verb>_through_at` time position) with no FK, NULL meaning the start of the sweep; optional `sweep_upper_bound_<thing>_id`; `updated_at` with its trigger; the job inserts its own row (`ON CONFLICT DO NOTHING`). Per-unit progress is a `_work_items` column, not a cursor table                                                                                               | `_cursors`    |

These go away: `_change_logs`, `_history`, `_audit_logs`, mutable `_events`, `_receipts`,
`_finalizations`, `_reconciliations`, `_dirty_work`, `_intents`, `_effects` and `_external_works`.
`_events` stays only for append-only inbound or protocol logs that use `occurred_at`:
`oauth_authorization_server_events`, `stripe_events` (append-only once its processing moves to
`stripe_event_processing_work_items`) and `amazon_ses_bounce_events` (`ses_timestamp` →
`occurred_at`). The mutable `copyright_notice_lifecycle_changes` table is renamed
`copyright_notice_lifecycle_changes` (the `_changes` shape).

Queue details (decision 16):

- **Where the lease lives.** Ask "does this row exist only because of the work?" If yes (intents,
  requests, dirty markers, projection jobs), the lease columns stay on it. If the record outlives
  the job (a Stripe event, a membership, a verification), the lease moves to
  `<entity>_<job>_work_items`: pk = the entity id (plus `generation` when a re-enqueue can race a
  running worker), FK → the entity ON DELETE CASCADE, the lease and outcome timestamps, a partial
  claim index on open rows, and retention pruning. No shared polymorphic leases table.
- **One vocabulary.** `lease_token uuid`, `leased_at`, `lease_expires_at`, `attempt_count`,
  `available_at`, `generation` (only where needed). Retries that need their own record are
  `_attempts` rows with `attempt_number`. Every renew, complete or fail writes
  `WHERE lease_token = $mine`, so a worker that lost its lease changes nothing.
- **Not worker leases** (keep their own shapes): `oauth_authorizations.exchange_claim_id` (one-shot
  compare-and-set), `moderation_queue_claims` (a moderator's assignment),
  `user_deletion_external_works`/`user_deletion_request_steps` (child steps fenced through the
  parent), `identity_verification_attempts.checkout_claimed_at`, and the `released_at` columns on
  `membership_lineage_bindings` and `moderation_transparency_released_daily_rollups`.

History details (decision 15):

- **Actors are split by authority.** A `_changes` row is a ledger entry (a moderation lifecycle,
  a feed setting, a config change), so its actor must survive account deletion:
  `changed_by_id` → `retained_user_identities` ON DELETE RESTRICT. A BEFORE INSERT trigger,
  `fn_ensure_retained_actor_identity('changed_by_id')`, calls the generic
  `fn_ensure_retained_identity` helper so the identity row exists. 8 tables end up this way:
  - already compliant: `membership_changes`, `post_clearance_changes`;
  - converting from users SET NULL: `community_post_review_changes`,
    `fediverse_instance_integration_changes`, `moderation_appeal_lifecycle_changes`,
    `review_dispute_lifecycle_changes`, `rss_feed_setting_changes` (merged from the 2 rss_feed
    tables) and `copyright_notice_lifecycle_changes`.

  Renames: `actor_user_id` and `created_by_id` → `changed_by_id`. A change made by the system has
  `changed_by_id` NULL; operator-initiated media-delivery replay records the retained operator.
  A `_revisions` row records who edited content, so `revised_by_id` → users SET NULL, as
  `post_revisions` and `topic_revisions` do today.

- **A `_changes` row does not copy its parent.** The 2 lifecycle logs drop the 5 copied timestamps
  and `resolution_action`; the time of a change is its `id`. Data a reader joins on becomes a
  typed column: `metadata.original_decision` becomes `moderation_appeals.original_decided_by_id`
  (FK → `retained_user_identities` RESTRICT), `original_decision_reason` and
  `original_decided_at`. `metadata jsonb` stays for unjoined data (the AI draft's `model` and
  `recommended_action`).
- **Append-only means** no UPDATE except erasing listed actor columns to NULL, and no DELETE
  except a parent's `ON DELETE CASCADE` (`fn_reject_mutation`, R5).
- `user_deletion_requests` owns deletion-request facts; a second audit-copy table is unnecessary.
- Copyright lifecycle rows remain immutable during privacy retention. Mandatory human-review
  ciphertext lives in `copyright_notice_lifecycle_change_rationales`, a required companion sharing
  the ledger row id and notice scope. Deferred foreign keys require both rows to commit together;
  controlled retention can erase the private ciphertext without rewriting the ledger.
- `copyright_notice_form_screening_attempts` retains one monotonic row per attempt. Retries and
  re-screening append a new attempt; only the latest attempt can supply automatic authority.
  `media_delivery_registry_changes` retains delivery transitions, while the current-record view
  reads the latest transition in the authority generation. Workflow progress is not copied onto
  `media_delivery_registry_records`.

## R5 — Helpers, not copies

- Trigger functions that differ only by table or message become one generic function
  parameterized by `TG_ARGV`/`TG_TABLE_NAME`:
  - `fn_reject_mutation(<actor column>, …)` replaces the always-raise functions (14 bodies that
    differ only in their message: `fn_reject_*_mutation`, `fn_reject_image_placement`,
    `fn_reject_copyright_notice_immutable_evidence`, …) and the column-immutability functions
    (`fn_protect_*`, `fn_prevent_*`, `fn_reject_images_id_immutable`,
    `fn_reject_admin_import_batch_type`, `fn_reject_classifier_*_identity_mutation`,
    `fn_reject_membership_product_identity_mutation`). Append-only tables attach it
    `BEFORE UPDATE OR DELETE … FOR EACH ROW`. A table where only some columns are immutable
    attaches it `BEFORE UPDATE OF <cols> … FOR EACH ROW WHEN (ROW(OLD.<cols>) IS DISTINCT FROM
ROW(NEW.<cols>))`: the `WHEN` clause does the comparison, so the function only raises. Its
    arguments are the actor columns that may be erased:
    - UPDATE passes only when every listed column in `NEW` is NULL or unchanged, and
      `to_jsonb(OLD) - <listed columns>` equals `to_jsonb(NEW) - <listed columns>`.
    - DELETE passes only when `pg_trigger_depth() > 1`, which is true inside a parent's
      `ON DELETE CASCADE`. Known limit: a DELETE issued by another trigger also passes.
    - Anything else raises `'% rows are append-only', TG_TABLE_NAME`.
  - `fn_project_latest_change()` replaces `fn_sync_rss_feed_is_{discoverable,enabled}` and
    `fn_sync_fediverse_instance_integration_status`. They are the same code: lock the target row,
    read the latest change by `id DESC`, and update the target column when it differs. `TG_ARGV`
    names the target table, its key, the log's key column, and the value columns; the body uses
    `format('%I')`. `fn_project_url_hostname_blocked` derives "any unlifted block", not the latest
    row, so it stays separate as `fn_project_url_hostname_blocked`.
  - `fn_register_retained_identity()` (a trigger) replaces the 6 `fn_register_retained_*`
    functions. The 6 `fn_ensure_retained_*` functions are helpers called from SQL
    (`0000-00-01-retained-entity-identities.sql`, `services/post-publication/identity-bridges.mts`);
    one helper, `fn_ensure_retained_identity(family retained_identity_families, id uuid)`, replaces
    them. PostgreSQL can't call a `RETURNS trigger` function from SQL or attach a regular function
    as a trigger, so the 8 `_changes` tables with a retained actor (R4) get a separate trigger,
    `fn_ensure_retained_actor_identity('<actor column>')`, which reads the column named in
    `TG_ARGV[0]` and calls the helper.
  - One function each, parameterized by `TG_ARGV`, replaces the transparency rollup pairs
    (`fn_moderation_transparency_{actions,reports}_{insert,delete}_rollup`), the
    `fn_stamp_*_transparency_scope` pair and `fn_create_{topic,user}_metrics_on_insert`.
- **A reference that must stay under the same parent is a composite FK, not a trigger.** At
  least 11 checks in 7 `fn_guard_*` functions verify that a referenced row belongs to the same
  parent (a review's recommendation belongs to the same email intake; a lifecycle row's source
  belongs to the same notice). Each becomes `FOREIGN KEY (parent_id, ref_id) REFERENCES
t (parent_id, id)`, with a `UNIQUE (parent_id, id)` on the referenced table. The default
  `MATCH SIMPLE` skips the check when `ref_id` is NULL, which is today's
  `IS NOT NULL AND NOT EXISTS`.
  A multi-hop copyright source carries its owning `copyright_notice_id` so the reference can
  use a concrete composite FK. `fn_update_parent_notice_scope` populates this scope on insertion;
  the FK enforces supplied values and later updates. Policy checks such as counter-notice kind,
  current compliance, and null-safe notice-less delivery intent pairing remain separate.
  Controlled legal erasure and retained legal receipts keep their dedicated mutation guards.
  Content-provenance rejection runs after all row mutators so it checks the final row.
- **Trigger-function verbs are a closed list** (decision 19). A function that `RETURNS trigger`
  is named `fn_<verb>_<what>`:
  - `fn_reject_*` raises when a write breaks a rule (today also `guard`, `require`, `assert`,
    `validate`, `protect`, `prevent`, `enforce`)
  - `fn_update_*` sets columns on the row being written (today also `stamp`, `assign`, the
    search-vector `sync`s)
  - `fn_project_*` writes derived state to other rows (today also `sync`, `refresh`, `apply`,
    `capture`, `record`, `mark`, `release`, `retire`, `handoff`, `fn_moderation_*`, `fn_ap_*`)
  - `fn_create_*` inserts companion rows
  - `fn_lock_*` takes locks
  - `fn_register_*` / `fn_ensure_*` handle retained identity

  Helper functions (the 25 that don't return `trigger`, such as `fn_wilson_score_lower_bound`
  and `fn_text_to_timestamptz`) keep `fn_` plus a name that says what they return.

- **Split when the columns differ; share when only a value differs** (decision 18). Per-target
  tables differ in their FK target, so they stay one table per target (decision 3). Tables whose
  columns match share one table, with the distinguishing value as a column when rows differ in
  meaning, and no column at all when they don't. Subtype-only columns go in a subtype table whose
  pk is the base row's id (supertype/subtype, "Class Table Inheritance"). A row with one of
  several sources uses an exclusive arc: one nullable FK per source plus
  `CHECK (num_nonnulls(…) = 1)`, never a type/id pair.
  - `user_agent_strings` is the shared session/vote value lookup: no discriminator, because
    the same string is the same row; see [shared lookup tables](#shared-lookup-tables)
  - `rss_feed_setting_changes` + `rss_feed_setting_changes` → `rss_feed_setting_changes`
  - `moderation_appeal_lifecycle_changes` and `review_dispute_lifecycle_changes` keep separate
    tables but take the R4 `_changes` shape
  - the 16 `copyright_eu_*`/`copyright_uk_*` tables become 7 shared `copyright_territorial_*`
    tables plus 2 EU-only tables, tied to the notice's jurisdiction by composite FKs; escalations
    keep their exclusive arc (decision 18)

## R6 — Query shape

- A query on a partitioned table constrains its partition key, or it is declared cross-partition
  with a reason.
- Partition by the dominant access key. `RANGE(id)` is allowed only when every hot reader carries an
  id or time bound.
- **A child row is never older than its parent** (decision 20). A reader of a `RANGE (id)` child
  table by its parent's UUIDv7 id adds `id >= min_uuidv7(uuid_extract_timestamp(<parent id>) -
interval '1 hour')` through the shared helper, so partitions from before the parent existed are
  skipped. The hour covers clock skew between id generators.
- **A rate limit reads the table keyed by the actor.** A check like "this sender did X in the last
  day" reads a table partitioned or indexed by sender (`follower_distributions`), never the fan-out
  rows partitioned by recipient.
- UUIDv7 tables filter and order by `id`, not `created_at`. A `created_at` sort can't use the `id`
  index.
- Test existence with `EXISTS`, not `COUNT(*) > 0`. Use `NOT EXISTS`, not `NOT IN (SELECT…)`, which
  is also wrong when the subquery returns NULLs.
- Tables, whatever their width, are read and returned with explicit column lists: no `SELECT *`,
  `alias.*` or `RETURNING *` (decision 21). A view may be read with `*`, because its column list
  is the reviewed contract.
- No `OFFSET`. An optimizer fence is a `MATERIALIZED` CTE, not `OFFSET 0`.

## R7 — Every table, column and view has a comment

- `schema-static-analysis.test.mts` already enforces this for hand-written tables and their
  columns, with empty allowlists. All 2,722 non-exempt hand-written columns have one.
- A column is exempt when its name says what it holds (`id`, `created_at`, `updated_at`,
  `created_by_id`, `updated_by_id`, `deleted_at`, `deleted_by_id`) or it belongs to a vendor group
  whose table comment covers it (`bedrock_nova_multimodal_v1_*`, `lingua_rs_*`, `llm_moderation_*`,
  `openai_omni_moderation_*`, `search_vector`, `votes_{count,score}_*`). These exemptions stay.
- **Generated tables.** 59 are exempt today: 52 `relation__*` and 7 `*_votes`, with no table
  comments and 168 uncommented columns. After the vote-table split (R3) there are 75: 52
  `relation__*`, 6 `*_votes` and 17 `relation__*__votes`, with about 295 columns to comment. The generators emit `COMMENT ON TABLE` and
  `COMMENT ON COLUMN`, and the exemption goes away. The generators are
  `config-driven/0000-00-01-entity-relations.mts` and
  `config-driven/utils/election-schema-config.mts`.
  - Relation tables: the table comment comes from the relation config (for example "Users who
    follow topics"). `subject_id` and `object_id` name their target tables.
  - Vote tables: comments on `device_id`, `ip_address`, `session_id`, `user_agent_id` and `score`,
    plus `subject_id` and `entity_relation_id` on the relation vote tables.
  - Only the `migrations` ledger stays exempt, through an `allow` entry.
- **Views.** 19 of 22 have no comment (`view_posts`, `view_users_private`, `view_users_public`, …).
  Each gets one that says what it is for and who may read it. For the `view_users_*` pair, the
  comment states the privacy boundary.
- Enums and functions are out of scope: the snapshot doesn't record their comments.

## Index every foreign key with a referential-integrity-usable leading index

PostgreSQL does **not** auto-index FK columns. An unindexed FK makes every parent `DELETE` — and
every `ON DELETE RESTRICT` existence check — sequential-scan the child table.

- The FK column must be the **leading** column of some index. A composite index led by a different
  column does not serve the RI probe.
- Predicate matters: a partial index `WHERE <fkcol> IS NOT NULL` **is** RI-usable (the probe value is
  concrete/non-null). A partial index `WHERE deleted_at IS NULL` is **not** — cascades and RESTRICT
  checks touch soft-deleted children too, so the planner can't use it and falls back to a seq-scan.
- `ON DELETE SET NULL` audit columns (`*_by_id → users`) are the systemic exception: index only the
  ones on large tables (posts, conversations, topics, communities); accept the rest.

Tracked by #7355 (FK supporting-index + indexing the offenders). Enforced by
`postgres-fk-index` in [`.no-mistakes.yml`](../../.no-mistakes.yml) with
`allowDirective: fk-index-guard-allow`. SET NULL audit-column exemptions live in `allowedColumns`.

Named `ALTER TABLE … ADD CONSTRAINT … NOT VALID` statements must have a matching
`VALIDATE CONSTRAINT`, enforced by `postgres-constraint-validate`.
`postgres-require-named-constraints` requires added foreign keys and checks to have explicit names,
and `postgres-require-fk-on-delete` requires explicit deletion behavior. no-mistakes recovers `NOT VALID` adds inside `DO $$` `IF NOT EXISTS` wrappers
so they pair with top-level `VALIDATE CONSTRAINT`.

`postgres-no-add-column` requires new columns to be folded into the original prelaunch
`CREATE TABLE`. Its exception list in [`.no-mistakes.yml`](../../.no-mistakes.yml) is empty;
do not add upgrade-only column migrations. The rule rejects mismatched operations and stale
exceptions.

## No strict-prefix-redundant indexes

An index whose column list is a strict prefix of another index on the same table **with the same
partial predicate** is pure write/storage overhead — keep only the longer one. (Different opclasses,
different predicates, or a different sort-column position are **not** redundant.)

A `UNIQUE` prefix index (or one backing a primary/unique constraint) is **not** redundant unless the
longer index enforces the same uniqueness on the prefix columns — dropping it would remove a
data-integrity constraint, not just an access path. Only non-unique prefix indexes are drop candidates.

Tracked by #7356 (redundant-index guard + drops).

## Scope expensive `GENERATED … STORED` columns to their inputs

A generated column recomputes on **every** `UPDATE`, regardless of which column changed. For a costly
expression — e.g. the `search_vector` tsvector built from many nested `REGEXP_REPLACE` passes — a row
updated for unrelated reasons (embeddings, language detection, moderation) rebuilds the whole vector.

Use a `BEFORE INSERT OR UPDATE OF <source_cols>` trigger writing a plain stored (still-indexable)
column so unrelated updates skip the recompute. Keep it a real stored column to preserve the GIN index.

Tracked by #7357.

## Store and compare denormalized score columns in one consistent float type

Never mix `REAL` storage with `DOUBLE PRECISION` compute and an `EPSILON` change-check. `REAL` is exact
only for integers ≤ 2^24; once a fractional weighted sum passes ~32k, `0.5·ULP > EPSILON`, so the
change-detector is permanently "changed" → every recompute rewrites the row and re-enqueues its cache
refresh, defeating the debounced/no-op path. Pick one type (`DOUBLE PRECISION` for weighted sums) and
use it for the column, the compute, and the comparison.

This generalizes the existing vote-score rule in [psql AGENTS.md](../../backend/data-stores/psql/AGENTS.md).
Tracked by #7354.

## Large aggregation recomputes read the replica and absorb lag asynchronously

When a recomputed tally/counter over a large or unbounded append-only table (e.g. vote-score
aggregation, `SET votes_score_up = <recomputed>`) is written back as an idempotent full
recompute, read the **replica**, not the primary — do not add primary-read load for bulk
aggregation. Handle replica lag by running the recompute asynchronously with throttle
deduplication, an ordering key, and a fixed delay through the full throttle window plus a
replica-lag safety margin. For election tallies, a five-second throttle and one-second margin yield
a six-second delay; see the [elections queue timing](../overview/architecture/queues/elections/README.md).
A full recompute written back from a replica must carry a freshness marker captured by the exact
aggregate statement. Election tallies persist the PostgreSQL snapshot `xmax` plus its in-progress
transaction count and accept only a later marker, so out-of-order jobs cannot roll a newer tally
back. A marker does not make residual replica lag self-healing: when the last scheduled recompute
reads before replication catches up, no later recompute is guaranteed (#11113). This remains a
deliberate eventual-consistency tradeoff.
Freshness-critical synchronous paths (e.g. `...FromPrimary` variants used for RSS discoverability)
may still read the primary directly.

Tracked by #7352.

## Derive `created_at` from the UUIDv7 `id`, never a wall-clock default

A table whose primary key is `id uuid PRIMARY KEY DEFAULT uuidv7()` already encodes its creation
time in the key. A separate `created_at timestamptz DEFAULT now()` (or `CURRENT_TIMESTAMP`) is a
second, independently-drifting source of the same fact — and any index sorting by it duplicates the
ordering the `id` already provides. Define `created_at` as
`GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL` (`STORED` only when it must be indexed),
and order/paginate by `id` rather than `created_at`.

Enforced statically by `static-code-analysis/repo-file-policy/uuidv7-created-at-ddl-guard.mts`, which
flags any UUIDv7-keyed `CREATE TABLE` whose `created_at` is not generated from the id. This is the
DDL-time complement to the runtime "query by `id`, not `created_at`" predicate guard.

DML that writes those generated `created_at` columns is enforced by
`postgres-no-generated-column-writes` in [`.no-mistakes.yml`](../../.no-mistakes.yml).
`no-mistakes` 0.46.1 peels `DO $tag$` bodies for pairing engines; `chr()`-encoded statements may still
be skipped. Election vote tables (`post_votes`, `topic_votes`, `hostname_votes`,
`rss_feed_item_votes`, `agent_moderation_votes`, `user_vouch_votes`, and metadata-derived relation
vote parents) and
`user_deletion_relation_impacts` are created from TypeScript in
`backend/data-stores/psql/config-driven/` rather than migration SQL, so they stay in
`extraGeneratedColumns`.

Tracked by #7359.

## Related

- [backend/data-stores/psql/AGENTS.md](../../backend/data-stores/psql/AGENTS.md) — authoritative schema rules
- [Partitioning strategy](../overview/architecture/partitioning-strategy.md)
- [Schema Checks](reference-tests-schema-checks.md) — CI enforcement for the schema snapshot

## Shared lookup tables

Share a lookup when its columns describe the same value across sources. `user_agent_strings`
stores each trimmed browser user-agent string once, capped at 1024 characters, with no source
discriminator or `updated_at`. Sessions preserve an empty string for unknown agents and reference
the lookup with `ON DELETE RESTRICT`; votes omit unknown agents and use `ON DELETE SET NULL`.
`upsertUserAgentString` inserts without updating existing rows, then reads in a separate statement
so concurrent first-use inserts are visible after the uniqueness conflict resolves.
