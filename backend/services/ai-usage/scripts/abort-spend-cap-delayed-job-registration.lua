-- Remove only this generation's incomplete reservation. If marker persistence reached Valkey
-- before its caller observed an error, the marked phase remains durable for coordinator release.
-- KEYS[1] = registry; ARGV[1] = generation; ARGV[2] = job field.
if redis.call('HGET', KEYS[1], '__generation') ~= ARGV[1] then
  return 0
end
if redis.call('HGET', KEYS[1], ARGV[2]) ~= 'registering' then
  return 0
end
return redis.call('HDEL', KEYS[1], ARGV[2])
