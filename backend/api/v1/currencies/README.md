# Currencies API

## Endpoints

| Method | Route                | Authentication | Description                      |
| ------ | -------------------- | -------------- | -------------------------------- |
| GET    | `/api/v1/currencies` | Optional       | List supported currency metadata |

The response follows the canonical `{ results, page_info }` cursor contract. Each result contains a
lowercase ISO 4217 `code` and `minor_unit_exponent`. Use `after` and `limit` (maximum 25) for
pagination. Anonymous responses are publicly cacheable for the short cache interval.

## Performance

| Endpoint                 | Round Trips | Caching                          | Notes                       |
| ------------------------ | ----------- | -------------------------------- | --------------------------- |
| `GET /api/v1/currencies` | 2           | HTTP: anon Cache-Control (short) | Auth check, single DB query |

## Related

- [Currency catalog service](../../../services/currencies/README.md)
- [Pagination contract](../../../../docs/overview/architecture/pagination.md)
