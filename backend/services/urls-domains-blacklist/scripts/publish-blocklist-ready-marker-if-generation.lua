-- Publish the ready marker only when the snapshot generation is still current.
-- KEYS[1] = generation key
-- KEYS[2] = ready marker key
-- ARGV[1] = generation read before the snapshot
-- ARGV[2] = ready marker value
-- Returns 1 when the marker is published, otherwise 0.
local generation = redis.call('GET', KEYS[1])
if not generation then
  generation = '0'
end

if generation == ARGV[1] then
  redis.call('SET', KEYS[2], ARGV[2])
  return 1
end

return 0
