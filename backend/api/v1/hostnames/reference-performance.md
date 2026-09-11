# Performance

[Back to Hostnames API](README.md#performance)

| Endpoint                        | Round Trips | Caching                                                                 | Notes                                                                                                  |
| ------------------------------- | ----------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| GET /api/v1/hostnames           | 3           | Search: anon Valkey; Entities: Valkey batch; HTTP: Cache-Control (anon) | Search + parallel streaming (topics, elections, top URLs, votes)                                       |
| POST /api/v1/hostnames          | 2–4         | None                                                                    | Auth + read-then-write upsert; +2 for block flow (mark blocked + soft-delete relations)                |
| GET /api/v1/hostnames/blocked   | 2           | None                                                                    | Admin; auth + search query                                                                             |
| GET /api/v1/hostnames/:id       | 4           | Entities: Valkey; HTTP: Cache-Control (anon)                            | Auth, entity lookup, topic lookup, parallel batch (election, vote, URLs, feeds); +1 for admin crawlers |
| PATCH /api/v1/hostnames/:id     | 3           | None                                                                    | Auth + entity lookup + update/block                                                                    |
| PUT /api/v1/hostnames/:id/vote  | 3           | None                                                                    | Auth + entity lookup + upsert                                                                          |
| GET /api/v1/hostnames/:id/votes | 3           | None                                                                    | Auth + entity lookup + votes query                                                                     |
| GET /api/v1/hostnames/top       | 3           | Search: anon Valkey; Entities: Valkey batch; HTTP: Cache-Control (anon) | Search + parallel streaming (topics, elections, top URLs); +1 if topic filter                          |
| GET /api/v1/hostnames/social    | 3           | Entities: Valkey batch                                                  | Auth + search + parallel streaming (hostnames, elections, topics)                                      |
| GET /api/v1/hostnames/compare   | 3           | Entities: Valkey batch; HTTP: Cache-Control (anon)                      | Auth + batch hostname hydration + parallel batch (elections, topics)                                   |
