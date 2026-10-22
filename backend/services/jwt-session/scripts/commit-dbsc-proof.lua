-- Consume a proof challenge only while the same session authority remains live.
-- Keys: challenge, authority, sid revocation, user revocation cutoff.
-- Args: expected challenge JSON, expected authority JSON, replacement JSON or empty, device iat.
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
if redis.call('GET', KEYS[2]) ~= ARGV[2] then return 0 end
if redis.call('EXISTS', KEYS[3]) == 1 then return 0 end
local cutoff = tonumber(redis.call('GET', KEYS[4]))
if cutoff and tonumber(ARGV[4]) <= cutoff then return 0 end
if ARGV[3] ~= '' then
  redis.call('SET', KEYS[2], ARGV[3], 'KEEPTTL')
end
redis.call('UNLINK', KEYS[1])
return 1
