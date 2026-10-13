-- Drop a ready marker whose type cannot be read as a string.
-- KEYS[1] = ready marker key
-- Returns: 1 when an unreadable marker was unlinked, otherwise 0.
local keyType = redis.call('TYPE', KEYS[1])
if type(keyType) == 'table' then
  keyType = keyType['ok']
end

if keyType == 'list' or keyType == 'set' or keyType == 'zset' or keyType == 'hash' or keyType == 'stream' then
  return redis.call('UNLINK', KEYS[1])
end

return 0
