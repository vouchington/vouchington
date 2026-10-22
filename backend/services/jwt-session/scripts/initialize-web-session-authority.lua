-- Create refresh authority and its one initial registration challenge together.
-- Existing authority, including a concurrent binding, is never overwritten.
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
-- Revocation and initial authority creation share this linearization point.
if redis.call('EXISTS', KEYS[3]) == 1 then return -1 end
local cutoff = tonumber(redis.call('GET', KEYS[4]))
if cutoff and tonumber(ARGV[6]) <= cutoff then return -1 end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
if ARGV[5] == '1' then
  redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[4])
end
return 1
