-- Return one stable reverse-score page from a single recently-viewed ZSET.
-- KEYS[1] = user recently-viewed key
-- ARGV[1] = maximum rows to return
-- ARGV[2] = maximum stored rows to inspect
-- ARGV[3] = optional cursor score
-- ARGV[4] = optional cursor member UUID
local entries = redis.call('ZREVRANGE', KEYS[1], 0, tonumber(ARGV[2]) - 1, 'WITHSCORES')
local limit = tonumber(ARGV[1])
local afterScore = ARGV[3] ~= '' and tonumber(ARGV[3]) or nil
local afterId = ARGV[4] ~= '' and ARGV[4] or nil
local response = {}

for i = 1, #entries, 2 do
  local id = entries[i]
  local score = tonumber(entries[i + 1])
  local isAfter = afterScore == nil or score < afterScore or (score == afterScore and id < afterId)
  if isAfter then
    table.insert(response, id)
    table.insert(response, entries[i + 1])
    if #response >= limit * 2 then
      break
    end
  end
end

return response
