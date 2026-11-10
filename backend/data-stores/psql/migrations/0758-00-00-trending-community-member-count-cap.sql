-- The trending-communities refresh reads this row for its member probe.
-- Refresh runs on its own connection, so a session setting would not reach it.
-- One checked row keeps the probe capped when statistics are missing and on restore.
CREATE TABLE IF NOT EXISTS trending_community_member_count_caps (
  is_singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (is_singleton),
  member_count_cap INTEGER NOT NULL CHECK (member_count_cap BETWEEN 1 AND 10000)
);

INSERT INTO trending_community_member_count_caps (is_singleton, member_count_cap)
VALUES (TRUE, 1000)
ON CONFLICT (is_singleton) DO NOTHING;

COMMENT ON TABLE trending_community_member_count_caps IS 'Singleton member-count cap for the trending communities refresh. The view probes LIMIT cap+1 active members per community.';
COMMENT ON COLUMN trending_community_member_count_caps.is_singleton IS 'Checked singleton key. Exactly one cap row exists.';
COMMENT ON COLUMN trending_community_member_count_caps.member_count_cap IS 'Active members counted toward a community trending score. The refresh writes the dynamic-config value before it runs.';
