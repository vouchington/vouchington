-- A verified native-attestation renewal advances only the exact existing native authority.
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
local cutoff = tonumber(redis.call('GET', KEYS[3]))
if cutoff and tonumber(ARGV[4]) <= cutoff then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1
