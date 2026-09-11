-- Check bookmark relation readiness and bloom candidates in one roundtrip.
-- KEYS[1] = per-user bookmark bloom filter key
-- KEYS[2..relationCount+1] = ready marker keys in relation order
-- ARGV[1] = relation count
-- ARGV[2] = item count per relation
-- ARGV[3..] = flattened bloom items grouped by relation
-- Returns, per relation: ready flag followed by itemCount results.
-- Result values: ready 1/0; bloom 1=may exist, 0=definitely absent, -1=not ready.
local relationCount = tonumber(ARGV[1])
local itemCount = tonumber(ARGV[2])

if relationCount == nil or itemCount == nil then
  error('check-bloom-candidates: relation count and item count are required')
end

if #KEYS ~= relationCount + 1 then
  error('check-bloom-candidates: expected bloom filter key followed by ready keys')
end

if #ARGV ~= 2 + (relationCount * itemCount) then
  error('check-bloom-candidates: expected flattened item arguments')
end

local response = {}
local filterReady = redis.call('EXISTS', KEYS[1]) == 1

for relationIndex = 1, relationCount do
  local readyKey = KEYS[relationIndex + 1]
  local relationReady = filterReady and redis.call('EXISTS', readyKey) == 1

  if not relationReady then
    table.insert(response, 0)
    for _ = 1, itemCount do
      table.insert(response, -1)
    end
  else
    table.insert(response, 1)
    local items = {}
    local startOffset = 2 + ((relationIndex - 1) * itemCount)
    for itemIndex = 1, itemCount do
      table.insert(items, ARGV[startOffset + itemIndex])
    end

    local results = redis.call('BF.MEXISTS', KEYS[1], unpack(items))
    for _, result in ipairs(results) do
      table.insert(response, result)
    end
  end
end

return response
