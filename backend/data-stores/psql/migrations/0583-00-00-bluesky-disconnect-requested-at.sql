ALTER TABLE bluesky_linked_accounts
ADD COLUMN IF NOT EXISTS disconnect_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bluesky_linked_accounts__pending_disconnect
ON bluesky_linked_accounts (disconnect_requested_at, link_authorization_id)
WHERE disconnect_requested_at IS NOT NULL;

COMMENT ON COLUMN bluesky_linked_accounts.disconnect_requested_at IS 'Durable unlink intent. Requested rows are hidden immediately and replayed by bluesky-follow-propagation until the exact credential generation is revoked.';
