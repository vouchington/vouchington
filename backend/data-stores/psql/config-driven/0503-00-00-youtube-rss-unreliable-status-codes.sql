-- YouTube channel RSS feeds can intermittently return 404 for still-valid feeds.
-- Keep those 404s retryable at the hostname-policy layer without clobbering
-- operator-configured retry statuses. Any existing non-null array, including
-- an explicit empty array, is authoritative.

-- no-mistakes: deadlock-safe -- the hostname INSERT is arbiter-ordered; the dependent block INSERT touches only transaction-private newly inserted ids.
WITH youtube_hosts(hostname) AS (
  VALUES
    ('youtube.com'),
    ('www.youtube.com')
),
existing AS (
  SELECT url_hostnames.id, url_hostnames.hostname
  FROM url_hostnames
  JOIN youtube_hosts ON youtube_hosts.hostname = url_hostnames.hostname
),
missing AS (
  SELECT youtube_hosts.hostname
  FROM youtube_hosts
  LEFT JOIN existing ON existing.hostname = youtube_hosts.hostname
  WHERE existing.id IS NULL
),
parent_policy AS (
  SELECT
    hostname,
    REPLACE(REPLACE(REPLACE(hostname, chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') AS hostname_like
  FROM url_hostnames
  WHERE is_blocked
),
inherited AS (
  SELECT
    missing.hostname,
    EXISTS (
      SELECT 1
      FROM parent_policy parent
      WHERE missing.hostname = parent.hostname
        OR missing.hostname LIKE '%.' || parent.hostname_like ESCAPE chr(92)
    ) AS is_blocked,
    FALSE AS should_skip_web_risk
  FROM missing
),
inserted AS (
  INSERT INTO url_hostnames (hostname, is_crawlable, is_blocked, should_skip_web_risk, unreliable_status_codes, publicly_introduced_at)
  SELECT hostname, TRUE, is_blocked, should_skip_web_risk, ARRAY[404]::SMALLINT[], CURRENT_TIMESTAMP
  FROM inherited
  ORDER BY inherited.hostname
  ON CONFLICT (hostname) DO NOTHING
  RETURNING id, is_blocked
),
updated AS (
  UPDATE url_hostnames
  SET unreliable_status_codes = COALESCE(unreliable_status_codes, ARRAY[404]::SMALLINT[]),
      publicly_introduced_at = COALESCE(publicly_introduced_at, CURRENT_TIMESTAMP)
  WHERE hostname IN (SELECT hostname FROM existing)
    AND (unreliable_status_codes IS NULL OR publicly_introduced_at IS NULL)
  RETURNING id
),
inherited_blocks AS (
  INSERT INTO url_hostname_blocks (url_hostname_id, blocked_source)
  SELECT id, 'parent_hostname'
  FROM inserted
  WHERE is_blocked
    AND NOT EXISTS (
      SELECT 1
      FROM url_hostname_blocks
      WHERE url_hostname_id = inserted.id
        AND lifted_at IS NULL
    )
  RETURNING 1
)
SELECT
  (SELECT COUNT(*) FROM inserted) + (SELECT COUNT(*) FROM updated) AS hostname_count,
  (SELECT COUNT(*) FROM inherited_blocks) AS inherited_block_count;
