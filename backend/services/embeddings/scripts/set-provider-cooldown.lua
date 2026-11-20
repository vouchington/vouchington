local key = KEYS[1]
local duration_ms = tonumber(ARGV[1])
if not duration_ms or duration_ms <= 0 then
  return redis.error_reply('invalid provider cooldown duration')
end

local remaining_ms = redis.call('PTTL', key)
if remaining_ms < duration_ms then
  redis.call('PSETEX', key, duration_ms, '1')
  return duration_ms
end
return remaining_ms
