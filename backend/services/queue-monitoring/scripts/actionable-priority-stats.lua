local scheduledKey = KEYS[1]
local now = tonumber(ARGV[1])
local priorityShift = 4398046511104
local maxPriority = 2048
local immediateAgeSampleLimit = 100

local actionableCount = 0
local oldestDueAt = nil
local remainingImmediateSamples = immediateAgeSampleLimit
local queueKey = string.sub(scheduledKey, 1, #scheduledKey - 10)
local cursorMin = priorityShift

-- Jump directly between populated priority score bands. This stays independent of backlog size and
-- avoids issuing commands for unused priority values.
while cursorMin <= maxPriority * priorityShift do
  local nextEntry = redis.call(
    'ZRANGEBYSCORE',
    scheduledKey,
    cursorMin,
    '+inf',
    'WITHSCORES',
    'LIMIT',
    0,
    1
  )
  if #nextEntry == 0 then
    break
  end

  local priority = math.floor(tonumber(nextEntry[2]) / priorityShift)
  if priority < 1 or priority > maxPriority then
    break
  end
  local scoreFloor = priority * priorityShift
  local scoreCeiling = scoreFloor + now
  local priorityCount = redis.call('ZCOUNT', scheduledKey, scoreFloor, scoreCeiling)
  actionableCount = actionableCount + priorityCount

  if priorityCount > 0 then
    local oldest = redis.call(
      'ZRANGEBYSCORE',
      scheduledKey,
      scoreFloor,
      scoreCeiling,
      'WITHSCORES',
      'LIMIT',
      0,
      1
    )
    local dueAt = tonumber(oldest[2]) - scoreFloor
    if dueAt > 0 then
      if oldestDueAt == nil or dueAt < oldestDueAt then
        oldestDueAt = dueAt
      end
    elseif remainingImmediateSamples > 0 then
      local immediateIds = redis.call(
        'ZRANGEBYSCORE',
        scheduledKey,
        scoreFloor,
        scoreFloor,
        'LIMIT',
        0,
        remainingImmediateSamples
      )
      remainingImmediateSamples = remainingImmediateSamples - #immediateIds
      for _, member in ipairs(immediateIds) do
        local separator = string.find(member, '||', 1, true)
        local jobId = separator and string.sub(member, 1, separator - 1) or member
        local timestamp = tonumber(redis.call('HGET', queueKey .. ':job:' .. jobId, 'timestamp'))
        if timestamp ~= nil and (oldestDueAt == nil or timestamp < oldestDueAt) then
          oldestDueAt = timestamp
        end
      end
    end
  end

  if priority == maxPriority then
    break
  end
  cursorMin = (priority + 1) * priorityShift
end

local streamKey = queueKey .. ':stream'
local pendingCount = 0
local pending = redis.pcall('XPENDING', streamKey, 'workers')
if type(pending) == 'table' and pending.err == nil then
  pendingCount = tonumber(pending[1]) or 0
end
local streamWaiting = math.max(0, redis.call('XLEN', streamKey) - pendingCount)
local waitingCount = streamWaiting
  + redis.call('LLEN', queueKey .. ':lifo')
  + redis.call('LLEN', queueKey .. ':priority')
  + actionableCount

return { waitingCount, oldestDueAt or 0 }
