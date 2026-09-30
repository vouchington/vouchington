# Session advisory lock

- Own the session connect, lock, operation, unlock, and `release(true)` protocol. Callers pass lock SQL, unlock SQL, and bound values.
- Do not choose a shared key space. Two-integer advisory keys and one-bigint advisory keys stay disjoint, including Bluesky disconnect versus Bluesky user/DID transaction locks.
- Hold that one advisory-lock client across the operation, so the connect and the lock and unlock queries stay in this protocol.
