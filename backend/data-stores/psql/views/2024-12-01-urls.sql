-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE VIEW view_urls AS
  SELECT
    'url' AS __entity_type,
    urls.id,
    urls.url,
    urls.pathname,
    urls.search_params,
    urls.canonical_url_id,
    ROW_TO_JSON(view_url_hostnames) AS hostname
  FROM urls
  JOIN view_url_hostnames
    ON urls.hostname_id = view_url_hostnames.id
;

COMMENT ON VIEW view_urls IS 'URL response projection; callers enforce URL visibility and paid crawl-history access.';
