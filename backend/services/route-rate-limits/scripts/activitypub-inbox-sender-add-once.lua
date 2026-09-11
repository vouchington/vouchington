local key = KEYS[1]
local delivery_id = ARGV[1]
local threshold = tonumber(ARGV[2])
local ttl_seconds = tonumber(ARGV[3])

local server_time = redis.call('TIME')
local now_ms = tonumber(server_time[1]) * 1000 + tonumber(server_time[2]) / 1000
local min_score = now_ms - ttl_seconds * 1000
redis.call('ZREMRANGEBYSCORE', key, '-inf', min_score)

local allowed_member = 'delivery-allowed:' .. delivery_id
local limited_member = 'delivery-limited:' .. delivery_id
if redis.call('ZSCORE', key, allowed_member) then
  return 0
end
if redis.call('ZSCORE', key, limited_member) then
  return 1
end

local count = redis.call('ZCOUNT', key, '(' .. min_score, now_ms)
local limited = count + 1 >= threshold
redis.call('ZADD', key, now_ms, limited and limited_member or allowed_member)
redis.call('EXPIRE', key, ttl_seconds)
return limited and 1 or 0
