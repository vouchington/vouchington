local key = KEYS[1]
local day = ARGV[1]

local function decode_range(value)
  if not value then
    return nil
  end

  local ok, decoded = pcall(cjson.decode, value)
  if ok
    and type(decoded) == 'table'
    and type(decoded.earliestDay) == 'string'
    and type(decoded.latestDay) == 'string'
  then
    return decoded
  end

  return nil
end

local fallback_provided = ARGV[2] ~= nil
local previous_range = decode_range(redis.call('GET', key)) or decode_range(ARGV[2])
if not previous_range and not fallback_provided then
  return nil
end

local earliest = day
local latest = day

if previous_range then
  if previous_range.earliestDay < earliest then
    earliest = previous_range.earliestDay
  end
  if previous_range.latestDay > latest then
    latest = previous_range.latestDay
  end
end

local next_range = { earliestDay = earliest, latestDay = latest }
redis.call('SET', key, cjson.encode(next_range))
return cjson.encode({
  previousRange = previous_range or cjson.null,
  nextRange = next_range,
})
