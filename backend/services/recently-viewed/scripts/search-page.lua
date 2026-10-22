-- Return one stable reverse-score page from a single recently-viewed ZSET.
-- KEYS[1] = user recently-viewed key
-- ARGV[1] = maximum rows to return
-- ARGV[2] = maximum stored rows to inspect
-- ARGV[3] = optional cursor score
-- ARGV[4] = optional cursor member UUID
--
-- Order is descending score, then descending member id. Only the top ARGV[2] ranks are
-- visible. When the cursor member is still stored at the cursor score, the next page is
-- the following ranks. A removed or re-scored member falls back to filtering that window.

local limit = tonumber(ARGV[1])
local maxLimit = tonumber(ARGV[2])
if limit == nil or maxLimit == nil or maxLimit < 1 then
  error('recently-viewed-search-page: limit and max limit are required')
end

local afterId = ARGV[4] ~= '' and ARGV[4] or nil
local afterScore = ARGV[3] ~= '' and tonumber(ARGV[3]) or nil
local response = {}
local pageSize = limit
if pageSize < 1 then
  pageSize = 1
elseif pageSize > maxLimit then
  pageSize = maxLimit
end

local function append(id, scoreRaw)
  table.insert(response, id)
  table.insert(response, scoreRaw)
  return #response >= pageSize * 2
end

local function appendRange(startRank, endRank)
  if startRank > endRank then
    return
  end
  local entries = redis.call('ZREVRANGE', KEYS[1], startRank, endRank, 'WITHSCORES')
  for index = 1, #entries, 2 do
    if append(entries[index], entries[index + 1]) then
      return
    end
  end
end

local function isAfter(id, score)
  if afterScore == nil then
    return true
  end
  if score < afterScore then
    return true
  end
  return score == afterScore and afterId ~= nil and id < afterId
end

local function filterWindow()
  local entries = redis.call('ZREVRANGE', KEYS[1], 0, maxLimit - 1, 'WITHSCORES')
  for index = 1, #entries, 2 do
    local id = entries[index]
    if isAfter(id, tonumber(entries[index + 1])) and append(id, entries[index + 1]) then
      return
    end
  end
end

if afterScore == nil then
  appendRange(0, pageSize - 1)
  return response
end

if afterId == nil then
  filterWindow()
  return response
end

-- Redis nil replies are Lua false. Rank 0 is the newest member.
local rank = redis.call('ZREVRANK', KEYS[1], afterId)
if rank ~= false and rank < maxLimit then
  local current = redis.call('ZSCORE', KEYS[1], afterId)
  if current ~= false and tonumber(current) == afterScore then
    local startRank = rank + 1
    local endRank = startRank + pageSize - 1
    if endRank > maxLimit - 1 then
      endRank = maxLimit - 1
    end
    appendRange(startRank, endRank)
    return response
  end
end

filterWindow()
return response
