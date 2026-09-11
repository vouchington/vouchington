-- Close registration before draining so the registry cannot become non-empty after completion.
-- KEYS[1] = per-day registry hash; ARGV[1] = coordinator generation;
-- ARGV[2] = unique lease for this release pass.
if redis.call('HGET', KEYS[1], '__generation') ~= ARGV[1] then
  return 0
end

redis.call('HSET', KEYS[1], '__mode', 'releasing', '__release_lease', ARGV[2])
return 1
