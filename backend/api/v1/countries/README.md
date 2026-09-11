# Countries API

Country reference data, used for retailer country lists and other lookups.

## Endpoints

| Method | Route               | Authentication | Description        |
| ------ | ------------------- | -------------- | ------------------ |
| GET    | `/api/v1/countries` | Optional       | List all countries |

## GET /api/v1/countries

Returns all countries from the global `countries` table, ordered by name.

Response:

```json
{
  "results": [
    { "id": 1, "code": "US", "name": "United States" },
    { "id": 2, "code": "CA", "name": "Canada" }
  ]
}
```

Publicly cacheable (`Cache-Control: public, max-age=60` for unauthenticated requests).

## Performance

| Endpoint              | Round Trips | Caching                          | Notes                       |
| --------------------- | ----------- | -------------------------------- | --------------------------- |
| GET /api/v1/countries | 2           | HTTP: anon Cache-Control (short) | Auth check, single DB query |

## Related

- Service: [../../../services/countries/README.md](../../../services/countries/README.md)
- Parent: [../CLAUDE.md](../../CLAUDE.md)
- Backend API: [../../README.md](../../README.md)
