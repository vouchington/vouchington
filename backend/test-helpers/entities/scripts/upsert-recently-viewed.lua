-- Duplicate of backend/services/recently-viewed/scripts/upsert.lua for test-helpers-internal
-- use — this package must never depend on @services/recently-viewed (that service already
-- devDeps this package for its own tests). Keep in sync if the source script changes.
--
-- Upsert an entity into one or two recently-viewed sorted sets.
-- KEYS[1..n] = sorted set keys
-- ARGV[1] = ttl seconds
-- ARGV[2] = max retained entries
-- ARGV[3] = entity id
if #KEYS == 0 then
  return 0
end

local ttl = tonumber(ARGV[1])
local maxLimit = tonumber(ARGV[2])
local entityId = ARGV[3]
if ttl == nil or maxLimit == nil or entityId == nil then
  error('test-recently-viewed-upsert: ttl, max limit, and entity id are required')
end

local currentTime = redis.call('TIME')
local score = tonumber(currentTime[1]) * 1000 + tonumber(currentTime[2]) / 1000

-- Keep the production script's monotonic tie-breaker: Lua execution is atomic, so advancing past
-- the highest stored score preserves view order when calls observe the same server timestamp.
for _, key in ipairs(KEYS) do
  local latest = redis.call('ZREVRANGE', key, 0, 0, 'WITHSCORES')
  if latest[2] ~= nil then
    local latestScore = tonumber(latest[2])
    if latestScore >= score then
      score = latestScore + 0.001
    end
  end
end

for _, key in ipairs(KEYS) do
  redis.call('ZADD', key, score, entityId)
  redis.call('ZREMRANGEBYRANK', key, 0, -(maxLimit + 1))
  redis.call('EXPIRE', key, ttl)
end

return score
