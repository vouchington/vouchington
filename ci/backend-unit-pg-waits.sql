-- One sample of the backend test database: every client backend that is blocked, that blocks
-- another backend, or that has been running one statement for 1.5 seconds or more. Runs every
-- half second from the "Run backend tests" step, so a statement that stalls until the test
-- database's 20 second statement_timeout names its wait event, blockers and ungranted locks while
-- the stall is happening. Prints nothing while the shard is healthy.
WITH client AS (
  SELECT pid, state, wait_event_type, wait_event, xact_start, query_start,
    pg_blocking_pids(pid) AS blockers, query
  FROM pg_stat_activity
  WHERE backend_type = 'client backend' AND application_name <> 'ci-pg-wait-sampler'
)
SELECT to_char(clock_timestamp(), 'HH24:MI:SS.MS') AS at,
  CASE
    WHEN cardinality(client.blockers) > 0 THEN 'waiter'
    WHEN client.pid IN (SELECT unnest(blockers) FROM client) THEN 'blocker'
    ELSE 'slow'
  END AS role,
  client.pid, client.state,
  coalesce(client.wait_event_type, '') AS wait_type, coalesce(client.wait_event, '') AS wait_event,
  round(extract(epoch FROM clock_timestamp() - client.query_start)::numeric, 2) AS statement_s,
  round(extract(epoch FROM clock_timestamp() - client.xact_start)::numeric, 2) AS transaction_s,
  array_to_string(client.blockers, ',') AS blocked_by,
  (SELECT string_agg(DISTINCT lock.locktype || ':' || lock.mode || ':'
      || coalesce(lock.relation::regclass::text, lock.classid::text || '/' || lock.objid::text), ',')
    FROM pg_locks lock WHERE lock.pid = client.pid AND NOT lock.granted) AS waiting_for,
  left(regexp_replace(client.query, '\s+', ' ', 'g'), 120) AS query
FROM client
WHERE cardinality(client.blockers) > 0
  OR client.pid IN (SELECT unnest(blockers) FROM client)
  OR (client.state = 'active' AND clock_timestamp() - client.query_start > interval '1500 ms')
ORDER BY client.query_start;
