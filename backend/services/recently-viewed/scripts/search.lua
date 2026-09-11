-- Search recently-viewed sorted sets and merge/dedupe by highest score.
-- KEYS[1..n] = sorted set keys, usually session and/or user key
-- ARGV[1] = effective limit
-- ARGV[2] = max entries fetched per key
if #KEYS == 0 then
  return {}
end

local effectiveLimit = tonumber(ARGV[1])
local maxLimit = tonumber(ARGV[2])
if effectiveLimit == nil or maxLimit == nil then
  error('recently-viewed-search: effective limit and max limit are required')
end
if effectiveLimit <= 0 then
  return {}
end

if #KEYS == 1 then
  return redis.call('ZREVRANGE', KEYS[1], 0, effectiveLimit - 1)
end

local scoreById = {}
for _, key in ipairs(KEYS) do
  local entries = redis.call('ZREVRANGE', key, 0, math.min(effectiveLimit, maxLimit) - 1, 'WITHSCORES')
  for i = 1, #entries, 2 do
    local id = entries[i]
    local score = tonumber(entries[i + 1])
    local existing = scoreById[id]
    if existing == nil or score > existing then
      scoreById[id] = score
    end
  end
end

local merged = {}
for id, score in pairs(scoreById) do
  table.insert(merged, { id, score })
end

table.sort(merged, function(a, b)
  if a[2] == b[2] then
    return a[1] < b[1]
  end
  return a[2] > b[2]
end)

local response = {}
for i = 1, math.min(effectiveLimit, #merged) do
  table.insert(response, merged[i][1])
end

return response
