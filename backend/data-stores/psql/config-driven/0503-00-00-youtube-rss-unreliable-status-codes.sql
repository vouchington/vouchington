-- no-mistakes-disable-file postgres-idempotent-insert: one data-modifying WITH has two guarded INSERTs (url_hostnames ON CONFLICT DO NOTHING, url_hostname_blocks NOT EXISTS). sqlparser cannot parse this file as a whole (`unparseable fragment carries more than one INSERT`); splitting would drop the `inserted` RETURNING bound so inherited blocks would no longer apply only to newly inserted hostnames.
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
  WHERE blocked = TRUE
),
inherited AS (
  SELECT
    missing.hostname,
    EXISTS (
      SELECT 1
      FROM parent_policy parent
      WHERE missing.hostname = parent.hostname
        OR missing.hostname LIKE '%.' || parent.hostname_like ESCAPE chr(92)
    ) AS blocked,
    FALSE AS skip_web_risk
  FROM missing
),
inserted AS (
  INSERT INTO url_hostnames (hostname, crawlable, blocked, skip_web_risk, unreliable_status_codes)
  SELECT hostname, TRUE, blocked, skip_web_risk, ARRAY[404]::SMALLINT[]
  FROM inherited
  ORDER BY inherited.hostname
  ON CONFLICT (hostname) DO NOTHING
  RETURNING id, blocked
),
updated AS (
  UPDATE url_hostnames
  SET unreliable_status_codes = ARRAY[404]::SMALLINT[]
  WHERE hostname IN (SELECT hostname FROM existing)
    AND unreliable_status_codes IS NULL
  RETURNING id
),
inherited_blocks AS (
  INSERT INTO url_hostname_blocks (url_hostname_id, blocked_source)
  SELECT id, 'parent_hostname'
  FROM inserted
  WHERE blocked = TRUE
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
