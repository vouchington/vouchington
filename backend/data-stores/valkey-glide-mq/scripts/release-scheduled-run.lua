if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('UNLINK', KEYS[1], KEYS[2])
  return 1
end
return 0
