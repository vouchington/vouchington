local key = KEYS[1]
local row_member = 'rss-import-row:' .. ARGV[1]
local limit = tonumber(ARGV[2])
local ttl_seconds = tonumber(ARGV[3])

local server_time = redis.call('TIME')
local now_ms = tonumber(server_time[1]) * 1000 + tonumber(server_time[2]) / 1000
local min_score = now_ms - ttl_seconds * 1000
redis.call('ZREMRANGEBYSCORE', key, '-inf', min_score)

-- A retry of an admitted row reuses its original charge, even when another row filled the window.
if redis.call('ZSCORE', key, row_member) then
  return 1
end

if redis.call('ZCOUNT', key, '(' .. min_score, now_ms) >= limit then
  return 0
end

redis.call('ZADD', key, now_ms, row_member)
redis.call('EXPIRE', key, ttl_seconds)
return 1
