-- Return a durable decision with the lease operation. A response lost after a collision must
-- not let a fresh tick retry after the holder finishes and execute work known to overlap.
if redis.call('HGET', KEYS[2], ARGV[4]) == ARGV[2] then
  return 0 -- previously skipped tick
end

local holder = redis.call('GET', KEYS[1])
if holder then
  if holder == ARGV[1] then return 2 end -- same job retrying its own lease
  if redis.call('HGET', KEYS[2], ARGV[3]) == ARGV[2] then
    return 3 -- admitted retained page must defer, not disappear
  end
  redis.call('HSET', KEYS[2], ARGV[4], ARGV[2])
  return 0 -- fresh overlapping tick
end

redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[5])
return 1 -- acquired
