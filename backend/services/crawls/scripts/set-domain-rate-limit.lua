-- Set a crawler domain rate-limit lock without shortening an existing longer lock.
-- KEYS[1] = domain rate-limit key
-- ARGV[1] = requested lock duration in milliseconds
-- Returns: effective remaining lock duration in milliseconds
local requestedTtlMs = tonumber(ARGV[1])
if requestedTtlMs == nil or requestedTtlMs <= 0 then
  error('set-domain-rate-limit: positive ttl milliseconds are required')
end

local currentTtlMs = redis.call('PTTL', KEYS[1])
if currentTtlMs == -2 or currentTtlMs == -1 or currentTtlMs < requestedTtlMs then
  redis.call('SET', KEYS[1], '1', 'PX', requestedTtlMs)
  return requestedTtlMs
end

return currentTtlMs
