-- Advance the blocklist bloom generation and record the transaction the replica must see.
-- The stored transaction id only moves forward, so racing bumps cannot leave an older id.
-- KEYS[1] = generation key
-- ARGV[1] = primary transaction id that committed this membership change
-- ARGV[2] = generation observed to be stale (beyond the primary), or '' for an ordinary bump
-- Returns the new generation string "<counter>:<transaction id>".
local function xid_greater(a, b)
  a = (string.gsub(a, '^0+', ''))
  b = (string.gsub(b, '^0+', ''))
  if #a ~= #b then
    return #a > #b
  end
  return a > b
end

local current = redis.call('GET', KEYS[1])
local counter = 0
local stored = nil
if current then
  local digits, xid = string.match(current, '^(%d+):(%d+)$')
  if digits then
    counter = tonumber(digits)
    stored = xid
  else
    digits = string.match(current, '^(%d+)')
    if digits then
      counter = tonumber(digits)
    end
  end
end

local xid = ARGV[1]
local replacing_stale = ARGV[2] ~= '' and current == ARGV[2]
if stored and not replacing_stale and xid_greater(stored, xid) then
  xid = stored
end

local value = tostring(counter + 1) .. ':' .. xid
redis.call('SET', KEYS[1], value)
return value
