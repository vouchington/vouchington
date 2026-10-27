-- Advance the blocklist bloom generation and record the transaction the replica must see.
-- KEYS[1] = generation key
-- ARGV[1] = primary transaction id that committed this membership change
-- Returns the new generation string "<counter>:<transaction id>".
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
