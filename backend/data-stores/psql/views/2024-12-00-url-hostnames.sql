-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE VIEW view_url_hostnames AS
  SELECT
    'hostname' AS __entity_type,
    url_hostnames.id,
    url_hostnames.hostname,
    url_hostnames.is_blocked,
    url_hostnames.is_crawlable,
    url_hostnames.should_skip_web_risk,
    url_hostnames.should_follow_link_rel,
    url_hostnames.topic_id,
    url_hostnames.votes_score_net,
    url_hostnames.votes_count_up,
    url_hostnames.votes_count_down
  FROM url_hostnames
;
