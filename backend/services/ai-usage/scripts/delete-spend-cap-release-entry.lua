-- Delete only the phase observed by this release pass while its lease is still current.
-- KEYS[1] = registry; ARGV[1] = release lease; ARGV[2] = job field;
-- ARGV[3] = expected phase.
if redis.call('HGET', KEYS[1], '__mode') ~= 'releasing' then
  return 0
end
if redis.call('HGET', KEYS[1], '__release_lease') ~= ARGV[1] then
  return 0
end
if redis.call('HGET', KEYS[1], ARGV[2]) ~= ARGV[3] then
  return 0
end
return redis.call('HDEL', KEYS[1], ARGV[2])
