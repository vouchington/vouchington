-- Read both GlideMQ ordering frontiers in one Valkey command. The caller validates their
-- integer shape and treats missing/inconsistent metadata as an admission failure.
local allocated = redis.call('HGET', KEYS[1], ARGV[1])
local done = redis.call('HGET', KEYS[2], ARGV[2])
return { allocated or '', done or '' }
