-- Atomically checks session/user-wide revocation and JWT staleness in a single roundtrip.
-- KEYS[1]: voucha:jwt-revoked:<sid>
-- KEYS[2]: voucha:jwt-stale:<userId>
-- KEYS[3]: voucha:jwt-user-revoked-before:<userId>
-- ARGV[1]: session issued-at timestamp in epoch seconds
-- Returns: {revoked (0|1), stale marker string or false}
local revoked = redis.call('EXISTS', KEYS[1])
local issued_at = tonumber(ARGV[1])
if revoked == 0 and issued_at ~= nil then
  local revoked_before_raw = redis.call('GET', KEYS[3])
  if revoked_before_raw then
    local user_revoked_before = tonumber(revoked_before_raw)
    if user_revoked_before ~= nil and issued_at <= user_revoked_before then
      revoked = 1
    end
  end
end
local stale = redis.call('GET', KEYS[2])
return {revoked, stale}
