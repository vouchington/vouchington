-- Atomically checks the per-session cache marker and JWT staleness in one roundtrip.
-- KEYS[1]: voucha:jwt-revoked:<sid>
-- KEYS[2]: voucha:jwt-stale:<userId>
-- Returns: {revoked (0|1), stale marker string or false}
local revoked = redis.call('EXISTS', KEYS[1])
local stale = redis.call('GET', KEYS[2])
return {revoked, stale}
