-- Reject stale decisions during release, or atomically reopen collection after a fresh breach.
-- KEYS[1] = registry; ARGV[1] = job field; ARGV[2] = candidate generation; ARGV[3] = TTL ms;
-- ARGV[4] = reopen releasing generation after a fresh same-day breach.
local generation = redis.call('HGET', KEYS[1], '__generation')
if generation == false then
  generation = ARGV[2]
  redis.call('HSET', KEYS[1], '__generation', generation, '__mode', 'collecting')
end
local mode = redis.call('HGET', KEYS[1], '__mode')
if mode == 'releasing' and ARGV[4] ~= '1' then
  return { 0, generation, 0 }
end
if ARGV[4] == '1' then
  redis.call('HSET', KEYS[1], '__mode', 'collecting')
  redis.call('HDEL', KEYS[1], '__release_lease')
end

if redis.call('HGET', KEYS[1], ARGV[1]) == 'marked' then
  redis.call('PEXPIRE', KEYS[1], ARGV[3])
  return { 1, generation, 1 }
end
redis.call('HSET', KEYS[1], ARGV[1], 'registering')
redis.call('PEXPIRE', KEYS[1], ARGV[3])
return { 1, generation, 0 }
