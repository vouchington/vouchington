-- edited-in-place: pre-launch, never deployed to production
-- Receipt table for Bluesky (AT Protocol) follow-record propagation (Phase D3). Tracks the AT-URI
-- of the app.bsky.graph.follow record created in the follower's PDS repo on the follower's behalf,
-- so the reconcile worker (@workers/bluesky-follow-propagation) can later delete it without a live
-- lookup against Bluesky. A row's presence means "a follow record currently exists on Bluesky for
-- this pair"; its absence means "no follow record exists" — the reconcile job diffs this against
-- Voucha's own relation__user__follow__user state and drives Bluesky to match.
--
-- Design note (see docs/overview/architecture/fediverse-federation.md's Phase D section): the
-- app.bsky.graph.follow lexicon declares `key: "tid"`, and the reference PDS implementation
-- enforces that key type at write time (packages/pds/src/repo/prepare.ts's validateRecord calls
-- schema.keySchema.safeValidate(rkey)), rejecting any putRecord/createRecord call with a
-- non-TID rkey unless validation is explicitly disabled. So this table cannot use a
-- deterministically-derived rkey as a natural idempotency key (an upsert-by-rkey putRecord
-- strategy) — the rkey is minted server-side by Bluesky's PDS on every create. This table is the
-- substitute idempotency mechanism: it is Voucha's durable record of "does a follow record already
-- exist," checked before ever calling createRecord again for the same pair.
CREATE TABLE IF NOT EXISTS bluesky_follow_records (
  follower_user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  followee_user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY (follower_user_id, followee_user_id),
  follower_bluesky_did TEXT NOT NULL,
  follower_authorization_id UUID NOT NULL,
  record_uri TEXT NOT NULL,
  CHECK (record_uri LIKE 'at://%' AND char_length(record_uri) <= 8192),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (follower_bluesky_did, follower_authorization_id)
    REFERENCES bluesky_linked_accounts (bluesky_did, link_authorization_id) ON DELETE CASCADE
);

-- followee_user_id is only the second column of the PK, so it has no RI-usable leading index of
-- its own (see docs/development/postgres-schema-rules.md).
CREATE INDEX IF NOT EXISTS idx_bluesky_follow_records__followee_user_id ON bluesky_follow_records (followee_user_id);
CREATE INDEX IF NOT EXISTS idx_bluesky_follow_records__follower_bluesky_did__authorization
  ON bluesky_follow_records (follower_bluesky_did, follower_authorization_id);

COMMENT ON TABLE bluesky_follow_records IS 'Receipt of a live app.bsky.graph.follow record created on Bluesky on behalf of a Voucha follow relation. Presence = record exists on Bluesky; absence = it does not. Reconciled against relation__user__follow__user by @workers/bluesky-follow-propagation. Never holds a self-chosen rkey — Bluesky''s PDS mints it server-side (see table comment).';
COMMENT ON COLUMN bluesky_follow_records.follower_user_id IS 'The Voucha user whose linked Bluesky account holds the follow record in its own PDS repo (the record''s `repo`).';
COMMENT ON COLUMN bluesky_follow_records.followee_user_id IS 'The Voucha user being followed; resolved to a Bluesky DID (the record''s `subject`) via bluesky_linked_accounts at reconcile time.';
COMMENT ON COLUMN bluesky_follow_records.follower_bluesky_did IS 'Exact Bluesky repo generation that owns record_uri. The composite account foreign key removes stale receipts when that credential is unlinked.';
COMMENT ON COLUMN bluesky_follow_records.follower_authorization_id IS 'Exact link authorization generation whose credential created record_uri; never reusable by a later relink.';
COMMENT ON COLUMN bluesky_follow_records.record_uri IS 'The full AT-URI (at://<follower_did>/app.bsky.graph.follow/<rkey>) returned by createRecord, passed verbatim to deleteRecord on unfollow. Not decomposed into repo/rkey columns — @atproto/api''s Agent.deleteFollow(uri) parses it directly.';
