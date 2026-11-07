-- Increment the visibility-retry counter and refresh its TTL together.
-- A separate INCR and EXPIRE can leave the counter without a TTL if the client stops between them.
-- KEYS[1] = retries key
-- ARGV[1] = TTL seconds
-- Returns the counter after increment.
local retries = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[1])
return retries
