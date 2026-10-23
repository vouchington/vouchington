local key = KEYS[1]
local user = ARGV[1]
local at = tonumber(ARGV[2])
local cutoff = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
redis.call('ZADD', key, 'GT', at, user)
redis.call('ZREMRANGEBYSCORE', key, '-inf', '(' .. cutoff)
redis.call('EXPIRE', key, ttl)
return 1
