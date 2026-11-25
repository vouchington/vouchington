-- Delete only the phases observed by this release pass while its lease is still current.
-- KEYS[1] = registry; ARGV[1] = release lease;
-- ARGV[2..] = job field and expected phase pairs. Returns the number of deleted fields.
if redis.call('HGET', KEYS[1], '__mode') ~= 'releasing' then
  return 0
end
if redis.call('HGET', KEYS[1], '__release_lease') ~= ARGV[1] then
  return 0
end

local deleted = 0
for argumentIndex = 2, #ARGV, 2 do
  if redis.call('HGET', KEYS[1], ARGV[argumentIndex]) == ARGV[argumentIndex + 1] then
    deleted = deleted + redis.call('HDEL', KEYS[1], ARGV[argumentIndex])
  end
end
return deleted
