# OAuth Apps and Connected Apps

[Back to My API](README.md#oauth-apps)

## OAuth Apps

| Method | Route                                      | Authentication | Description                                                |
| ------ | ------------------------------------------ | -------------- | ---------------------------------------------------------- |
| GET    | `/api/v1/my/oauth-apps`                    | Required       | List the OAuth apps the current user registered            |
| POST   | `/api/v1/my/oauth-apps`                    | Required       | Register an app; a confidential app's secret is shown once |
| PATCH  | `/api/v1/my/oauth-apps/:id`                | Required       | Rename an app or replace its redirect URIs                 |
| DELETE | `/api/v1/my/oauth-apps/:id`                | Required       | Revoke an app and every credential issued to it            |
| POST   | `/api/v1/my/oauth-apps/:id/client-secrets` | Required       | Replace a confidential app's secret (public apps: 409)     |

Writes return 403 for suspended users. See [OAuth apps](../../../../docs/requirements/users/oauth-apps.md#oauth-apps).

## Connected Apps

| Method | Route                         | Authentication | Description                                   |
| ------ | ----------------------------- | -------------- | --------------------------------------------- |
| GET    | `/api/v1/my/oauth-grants`     | Required       | List the OAuth apps the current user approved |
| DELETE | `/api/v1/my/oauth-grants/:id` | Required       | Revoke an app's access (suspended users: 403) |

See [connected apps](../../../../docs/requirements/users/oauth-apps.md#connected-apps).
