-- Delete only an empty releasing registry. A registration after deletion creates a fresh cycle.
-- KEYS[1] = per-day registry hash; ARGV[1] = coordinator generation;
-- ARGV[2] = release lease.
if redis.call('HGET', KEYS[1], '__generation') ~= ARGV[1] then
  return 0
end
if redis.call('HGET', KEYS[1], '__mode') ~= 'releasing' then
  return 0
end
if redis.call('HGET', KEYS[1], '__release_lease') ~= ARGV[2] then
  return 0
end
if redis.call('HLEN', KEYS[1]) ~= 3 then
  return 0
end

redis.call('DEL', KEYS[1])
return 1
