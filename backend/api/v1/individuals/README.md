# Individuals API

Get the current user's individual identity record (auto-created on first access).

## Endpoints

| Method | Route                   | Authentication | Description                   |
| ------ | ----------------------- | -------------- | ----------------------------- |
| GET    | `/api/v1/me/individual` | Required       | Get current user's individual |

## GET /api/v1/me/individual

Returns the current user's individual record, creating it if it does not exist.

## Performance

| Endpoint                  | Round Trips | Caching | Notes                |
| ------------------------- | ----------- | ------- | -------------------- |
| GET /api/v1/me/individual | 2           | None    | Auth + get-or-create |

## Related

- Service: [../../services/individuals-households/](../../../services/individuals-households/README.md)
- Households: [../households/README.md](../households/README.md)
- Financial profile: [../my/README.md](../my/README.md)
- Parent: [../CLAUDE.md](../../CLAUDE.md)
