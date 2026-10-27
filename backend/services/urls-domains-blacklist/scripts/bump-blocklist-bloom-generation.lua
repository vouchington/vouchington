-- Advance the blocklist bloom generation and record when the commit landed.
-- KEYS[1] = generation key
-- ARGV[1] = bump timestamp in milliseconds
-- Returns the new generation string "<counter>:<timestamp>".
local current = redis.call('GET', KEYS[1])
local counter = 0
if current then
  local digits = string.match(current, '^(%d+)')
  if digits then
    counter = tonumber(digits)
  end
end

local value = tostring(counter + 1) .. ':' .. ARGV[1]
redis.call('SET', KEYS[1], value)
return value
