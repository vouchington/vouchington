-- Allocate a linearizable admission sequence before a logout request observes revocation.
-- KEYS[1] = per-session admission counter; KEYS[2] = committed revocation fence;
-- KEYS[3] = normal session-revocation marker; KEYS[4] = user cutoff marker;
-- ARGV[1] = lifetime in seconds; ARGV[2] = session issued-at seconds.
local sequence = redis.call('INCR', KEYS[1])
if sequence == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end

local committedFence = redis.call('GET', KEYS[2])
if committedFence ~= false then
  return { sequence, sequence <= tonumber(committedFence) and 1 or 0 }
end

if redis.call('EXISTS', KEYS[3]) == 1 then
  return { sequence, 0 }
end

local revokedBefore = redis.call('GET', KEYS[4])
if revokedBefore ~= false and tonumber(ARGV[2]) <= tonumber(revokedBefore) then
  return { sequence, 0 }
end

return { sequence, 1 }
