-- Atomically publish session revocation and the highest admission allowed to finish cleanup.
-- KEYS[1] = admission counter; KEYS[2] = committed fence; KEYS[3] = revocation marker;
-- ARGV[1] = lifetime in seconds.
local sequence = redis.call('GET', KEYS[1]) or '0'
redis.call('SET', KEYS[3], '1', 'EX', ARGV[1])
redis.call('SET', KEYS[2], sequence, 'EX', ARGV[1], 'NX')
return sequence
