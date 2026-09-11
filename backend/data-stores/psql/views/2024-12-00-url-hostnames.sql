CREATE OR REPLACE VIEW view_url_hostnames AS
  SELECT
    'hostname' AS __entity_type,
    url_hostnames.id,
    url_hostnames.hostname,
    url_hostnames.blocked,
    url_hostnames.crawlable,
    url_hostnames.skip_web_risk,
    url_hostnames.link_rel_follow,
    url_hostnames.topic_id,
    url_hostnames.votes_score_net,
    url_hostnames.votes_count_up,
    url_hostnames.votes_count_down
  FROM url_hostnames
;
