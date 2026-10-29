local key = KEYS[1]
local jobId = ARGV[1]
local cap = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
local jobKeyPrefix = ARGV[4]
local maxCap = tonumber(ARGV[5])
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)

-- An expired reservation is only stale when its exact native job has disappeared.
-- A paused or delayed job can outlive the usual retry window, and native expiry
-- can leave a sensitive failed hash until the observer removes it.
local expired = redis.call('ZRANGEBYSCORE', key, '-inf', now, 'LIMIT', 0, maxCap + 1)
if #expired > maxCap then return -1 end
redis.call('ZREMRANGEBYSCORE', key, '-inf', now)
for _, expiredJobId in ipairs(expired) do
  if redis.call('EXISTS', jobKeyPrefix .. expiredJobId) == 1 then
    redis.call('ZADD', key, now + ttl, expiredJobId)
  end
end
if redis.call('ZCARD', key) >= cap then return 0 end

redis.call('ZADD', key, now + ttl, jobId)
return 1
