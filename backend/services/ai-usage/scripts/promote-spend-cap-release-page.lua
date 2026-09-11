-- Atomically fence and release one page of delayed jobs using GlideMQ's queue-state semantics.
-- Every key shares the ai_agents hash tag.
-- KEYS: registry, stream, scheduled, events, lifo list, then one job hash per entry.
-- ARGV: release lease, expected delay day, then registry field and job ID pairs matching the job hashes.
if redis.call('HGET', KEYS[1], '__mode') ~= 'releasing' then
  return 0
end
if redis.call('HGET', KEYS[1], '__release_lease') ~= ARGV[1] then
  return 0
end

local released = 0
local priorityShift = 4398046511104
for keyIndex = 6, #KEYS do
  local argumentIndex = 3 + (keyIndex - 6) * 2
  local field = ARGV[argumentIndex]
  local jobId = ARGV[argumentIndex + 1]
  local phase = redis.call('HGET', KEYS[1], field)
  local state = redis.call('HGET', KEYS[keyIndex], 'state')
  local payload = redis.call('HGET', KEYS[keyIndex], 'data')
  local decodedOk, decoded = false, nil
  if type(payload) == 'string' then
    decodedOk, decoded = pcall(cjson.decode, payload)
  end
  if
    phase == 'marked'
    and state == 'delayed'
    and decodedOk
    and type(decoded) == 'table'
    and decoded.openAiSpendCapDelayedDay == ARGV[2]
  then
    redis.call('ZREM', KEYS[3], jobId)
    local priority = tonumber(redis.call('HGET', KEYS[keyIndex], 'priority')) or 0
    if priority > 0 then
      redis.call('ZADD', KEYS[3], string.format('%.0f', priority * priorityShift), jobId)
      redis.call('HSET', KEYS[keyIndex], 'state', 'prioritized', 'delay', '0')
      redis.call('XADD', KEYS[4], 'MAXLEN', '~', '1000', '*', 'event', 'delay-changed', 'jobId', jobId, 'delay', '0')
    elseif redis.call('HGET', KEYS[keyIndex], 'lifo') == '1' then
      redis.call('RPUSH', KEYS[5], jobId)
      redis.call('HSET', KEYS[keyIndex], 'state', 'waiting', 'delay', '0')
      redis.call('XADD', KEYS[4], 'MAXLEN', '~', '1000', '*', 'event', 'promoted', 'jobId', jobId)
    else
      redis.call('XADD', KEYS[2], '*', 'jobId', jobId, 'name', redis.call('HGET', KEYS[keyIndex], 'name') or '')
      redis.call('HSET', KEYS[keyIndex], 'state', 'waiting', 'delay', '0')
      redis.call('XADD', KEYS[4], 'MAXLEN', '~', '1000', '*', 'event', 'promoted', 'jobId', jobId)
    end
    redis.call('HDEL', KEYS[1], field)
    released = released + 1
  end
end
return released
