-- Reopen only the same generation if enforcement returns while a release is still draining.
-- KEYS[1] = per-day registry hash; ARGV[1] = coordinator generation.
if redis.call('HGET', KEYS[1], '__generation') ~= ARGV[1] then
  return 0
end

redis.call('HSET', KEYS[1], '__mode', 'collecting')
redis.call('HDEL', KEYS[1], '__release_lease')
return 1
