DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM api_keys
    WHERE cardinality(permissions) = 0
      OR cardinality(permissions) <> (
        SELECT count(DISTINCT permission)
        FROM unnest(permissions) AS permission
      )
      OR cardinality(permissions) <> (
        SELECT count(DISTINCT CASE permission
          WHEN 'rss-feeds:read' THEN 'rss:read'
          WHEN 'mcp-tools:read' THEN 'mcp.user:read'
          WHEN 'mcp-tools:write' THEN 'mcp.user:write'
          WHEN 'mcp-admin-tools:read' THEN 'mcp.admin:read'
          WHEN 'mcp-admin-tools:write' THEN 'mcp.admin:write'
          ELSE permission
        END)
        FROM unnest(permissions) AS permission
      )
      OR EXISTS (
        SELECT 1
        FROM unnest(permissions) AS permission
        WHERE permission NOT IN (
          'rss-feeds:read',
          'rss:read',
          'mcp-tools:read',
          'mcp.user:read',
          'mcp-tools:write',
          'mcp.user:write',
          'mcp-admin-tools:read',
          'mcp.admin:read',
          'mcp-admin-tools:write',
          'mcp.admin:write'
        )
      )
      OR (
        type = 'rss'
        AND NOT (
          cardinality(permissions) = 1
          AND permissions[1] IN ('rss-feeds:read', 'rss:read')
        )
      )
      OR (
        type = 'mcp'
        AND (
          EXISTS (
            SELECT 1
            FROM unnest(permissions) AS permission
            WHERE permission IN ('rss-feeds:read', 'rss:read')
          )
          OR (
            permissions && ARRAY['mcp-tools:read', 'mcp-tools:write', 'mcp.user:read', 'mcp.user:write']
            AND permissions && ARRAY['mcp-admin-tools:read', 'mcp-admin-tools:write', 'mcp.admin:read', 'mcp.admin:write']
          )
          OR (
            permissions && ARRAY['mcp-tools:write', 'mcp.user:write']
            AND NOT permissions && ARRAY['mcp-tools:read', 'mcp.user:read']
          )
          OR (
            permissions && ARRAY['mcp-admin-tools:write', 'mcp.admin:write']
            AND NOT permissions && ARRAY['mcp-admin-tools:read', 'mcp.admin:read']
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'api_keys contains unknown, duplicate, mixed-audience, or invalid scope sets';
  END IF;
END
$$;

WITH normalized AS (
  SELECT
    api_keys.id,
    array_agg(
      CASE permission
        WHEN 'rss-feeds:read' THEN 'rss:read'
        WHEN 'mcp-tools:read' THEN 'mcp.user:read'
        WHEN 'mcp-tools:write' THEN 'mcp.user:write'
        WHEN 'mcp-admin-tools:read' THEN 'mcp.admin:read'
        WHEN 'mcp-admin-tools:write' THEN 'mcp.admin:write'
        ELSE permission
      END
      ORDER BY CASE permission
        WHEN 'rss-feeds:read' THEN 'rss:read'
        WHEN 'mcp-tools:read' THEN 'mcp.user:read'
        WHEN 'mcp-tools:write' THEN 'mcp.user:write'
        WHEN 'mcp-admin-tools:read' THEN 'mcp.admin:read'
        WHEN 'mcp-admin-tools:write' THEN 'mcp.admin:write'
        ELSE permission
      END
    ) AS permissions
  FROM api_keys
  CROSS JOIN LATERAL unnest(api_keys.permissions) AS permission
  GROUP BY api_keys.id
)
UPDATE api_keys
SET permissions = normalized.permissions
FROM normalized
WHERE api_keys.id = normalized.id
  AND api_keys.permissions IS DISTINCT FROM normalized.permissions;

COMMENT ON COLUMN api_keys.permissions IS 'Canonical scope set granted to this key; validated against the application scope catalogue.';
