# Session advisory lock

- Own the session connect, lock, operation, unlock, and `release(true)` protocol on one held client.
  Callers pass lock SQL, unlock SQL, and bound values.
- Do not choose a shared key space. Two-integer advisory keys and one-bigint advisory keys stay
  disjoint, including Bluesky disconnect versus Bluesky user/DID transaction locks.
