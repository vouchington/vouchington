# Google Play Recovery

[Back to Memberships Queue System](README.md#google-play-recovery-transitions)

| Failure                                   | Durable state                                     | Recovery                                   | Idempotency                                            |
| ----------------------------------------- | ------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------ |
| Ingress enqueue fails                     | Authenticated RTDN evidence committed             | Non-2xx push retry and five-minute scan    | Message-ID uniqueness                                  |
| Worker never starts                       | Pending evidence or acknowledgement               | Scheduled bounded scan                     | Stable evidence/operation ID                           |
| Play call fails                           | Evidence or operation remains unfinished          | Queue retry then scheduled recovery        | Re-fetch current Play state                            |
| Play accepts acknowledgement, reply lost  | Operation still pending                           | Retry re-fetches acknowledgement state     | Play purchase token and durable operation              |
| Database commit fails after Play response | Operation still pending                           | Re-fetch before retry                      | Provider acknowledgement state                         |
| Duplicate or late RTDN                    | Existing message identity or newer observation    | Re-fetch and compare authority             | Lineage and observation uniqueness                     |
| Queue TTL expires                         | PostgreSQL work remains                           | Scheduled scan re-enqueues                 | Queue state is not authority                           |
| RTDN never arrives for an active source   | Bound source and encrypted token alias remain     | Hourly bounded source sweep refetches Play | Source identity, fresh evidence, and observation order |
| Terminal completion                       | Verified/rejected evidence or completed operation | Excluded from scans                        | Retained audit ledger                                  |

Recovery scans capture an inclusive UUIDv7 high-water mark before each bounded sweep. The cursor
advances only after fan-out succeeds and clears after reaching that bound, so continuous new
notifications, acknowledgements, or sources cannot starve work that was already pending. A direct
source remains eligible until it reaches a terminal projection state; elapsed expiry alone is not a
terminal provider observation.
