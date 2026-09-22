# Endpoints

[Back to My API](README.md#endpoints)

### Identity & Email

| Method | Route                                      | Authentication | Description                                             |
| ------ | ------------------------------------------ | -------------- | ------------------------------------------------------- |
| GET    | `/api/v1/my/identity`                      | Required       | Get current user's identity                             |
| PATCH  | `/api/v1/my/identity`                      | Required       | Update identity (username, display name, profile image) |
| GET    | `/api/v1/my/email-addresses`               | Required       | List email addresses                                    |
| POST   | `/api/v1/my/email-addresses`               | Required       | Add email address (sends verification code)             |
| POST   | `/api/v1/my/email-addresses/:email/verify` | Required       | Verify email with OTP token                             |
| PATCH  | `/api/v1/my/email-addresses/:email`        | Required       | Set email as primary                                    |
| DELETE | `/api/v1/my/email-addresses/:email`        | Required       | Remove email address                                    |

OAuth-only users may have an empty list. `POST /api/v1/my/email-addresses` returns the normalized
`email_address` used by the verification route. Verifying the first managed address makes it the
user's primary address and immediately invalidates the verified-email eligibility cache.

Email-address, API-key, and push-subscription list routes accept `limit` (1–100) and opaque
`after` cursors. Cursors are scoped to the authenticated owner, and `page_info` is derived from a
`limit + 1` query. Email addresses keep the primary address first, then order by creation time and
normalized email address; verify and set-primary mutations return the same bounded first-page
contract.

### Profile & Links

| Method | Route                                    | Authentication | Description                                                              |
| ------ | ---------------------------------------- | -------------- | ------------------------------------------------------------------------ |
| GET    | `/api/v1/my/profile`                     | Required       | Get profile (markdown bio)                                               |
| PATCH  | `/api/v1/my/profile`                     | Required       | Update profile markdown                                                  |
| GET    | `/api/v1/my/profile/links`               | Required       | List profile links                                                       |
| POST   | `/api/v1/my/profile/links`               | Required       | Create a profile link                                                    |
| PUT    | `/api/v1/my/profile/links/order`         | Required       | Reorder profile links                                                    |
| PATCH  | `/api/v1/my/profile/links/:id`           | Required       | Update a profile link                                                    |
| DELETE | `/api/v1/my/profile/links/:id`           | Required       | Delete a profile link                                                    |
| GET    | `/api/v1/my/landing-pages`               | Required       | List landing pages                                                       |
| POST   | `/api/v1/my/landing-pages`               | Required       | Create a landing page                                                    |
| GET    | `/api/v1/my/landing-pages/candidates`    | Required       | List selectable page content                                             |
| GET    | `/api/v1/my/landing-pages/:pageId`       | Required       | Get one landing page with items                                          |
| PATCH  | `/api/v1/my/landing-pages/:pageId`       | Required       | Update landing page metadata; send `{ is_default: true }` to set default |
| DELETE | `/api/v1/my/landing-pages/:pageId`       | Required       | Delete a landing page                                                    |
| PUT    | `/api/v1/my/landing-pages/:pageId/items` | Required       | Replace a landing page's ordered items                                   |
| GET    | `/api/v1/my/communities`                 | Required       | List communities the current user has joined                             |

### Moderation

| Method | Route                      | Authentication | Description                                     |
| ------ | -------------------------- | -------------- | ----------------------------------------------- |
| GET    | `/api/v1/my/bans`          | Required       | List active community bans for the current user |
| GET    | `/api/v1/my/removed-posts` | Required       | List removed posts for the current user         |
| GET    | `/api/v1/my/warnings`      | Required       | List received warnings for the current user     |

The bans and removed-posts continuations are scoped to the authenticated owner, resource, active
filters, and exact keyset order, so cursors cannot be replayed between users or list shapes.
Warnings use the same forward pagination surface: pass `after=page_info.end_cursor` with a bounded
`limit` to load the next page. Existing `cursor` callers remain accepted as a legacy alias for
`after`.

`/my/removed-posts` remains community-only by default. Passing `include_platform=true` opts into a
globally ordered union of community unpublishes and platform clearance rejections. The expanded
shape uses its own scoped timestamp, removal-kind, and UUID cursor, so neither cursor version can
be replayed against the other list contract. As an expand/contract exception for independently
deployed clients, `include_platform=true` accepts a legacy-scoped continuation by pinning that
traversal to the community-only query and continuing to emit legacy cursors. A fresh request without
a cursor uses the expanded contract.

### Notifications

| Method | Route                                             | Authentication | Description                                      |
| ------ | ------------------------------------------------- | -------------- | ------------------------------------------------ |
| GET    | `/api/v1/my/notifications`                        | Required       | List notifications                               |
| GET    | `/api/v1/my/notifications/unread`                 | Required       | Get unread count and unread preview              |
| GET    | `/api/v1/my/notifications/:id/redirect-target`    | Required       | Resolve the navigation target for a notification |
| PATCH  | `/api/v1/my/notifications/:id`                    | Required       | Mark a notification as read                      |
| POST   | `/api/v1/my/notifications/read-all`               | Required       | Mark all notifications as read                   |
| DELETE | `/api/v1/my/notifications/:id`                    | Required       | Asynchronously delete a notification             |
| GET    | `/api/v1/my/notifications/push-subscriptions`     | Required       | List browser push subscriptions                  |
| POST   | `/api/v1/my/notifications/push-subscriptions`     | Required       | Create or update a browser push endpoint         |
| DELETE | `/api/v1/my/notifications/push-subscriptions/:id` | Required       | Revoke a browser push endpoint                   |

### Connected Apps

| Method | Route                         | Authentication | Description                                   |
| ------ | ----------------------------- | -------------- | --------------------------------------------- |
| GET    | `/api/v1/my/oauth-grants`     | Required       | List the OAuth apps the current user approved |
| DELETE | `/api/v1/my/oauth-grants/:id` | Required       | Revoke an app's access (suspended users: 403) |

See [API keys and connected apps](../../../../docs/requirements/users/api-keys.md#connected-apps).

### Referral Clicks

| Method | Route                        | Authentication | Description                                       |
| ------ | ---------------------------- | -------------- | ------------------------------------------------- |
| GET    | `/api/v1/my/referral-clicks` | Required       | Paginated referral click log for the current user |

### Credit Cards

| Method | Route                  | Authentication | Description               |
| ------ | ---------------------- | -------------- | ------------------------- |
| GET    | `/api/v1/my/cards`     | Required       | List current user's cards |
| POST   | `/api/v1/my/cards`     | Required       | Add a card                |
| PATCH  | `/api/v1/my/cards/:id` | Required       | Update a card             |
| DELETE | `/api/v1/my/cards/:id` | Required       | Remove a card             |

### Spending Categories

| Method | Route                                | Authentication | Description                |
| ------ | ------------------------------------ | -------------- | -------------------------- |
| GET    | `/api/v1/my/spending-categories`     | Required       | List spending categories   |
| POST   | `/api/v1/my/spending-categories`     | Required       | Create a spending category |
| PATCH  | `/api/v1/my/spending-categories/:id` | Required       | Update a spending category |
| DELETE | `/api/v1/my/spending-categories/:id` | Required       | Delete a spending category |

### Rewards Program Statuses

| Method | Route                                     | Authentication | Description                     |
| ------ | ----------------------------------------- | -------------- | ------------------------------- |
| GET    | `/api/v1/my/rewards-program-statuses`     | Required       | List rewards program statuses   |
| POST   | `/api/v1/my/rewards-program-statuses`     | Required       | Add a rewards program status    |
| PATCH  | `/api/v1/my/rewards-program-statuses/:id` | Required       | Update a rewards program status |
| DELETE | `/api/v1/my/rewards-program-statuses/:id` | Required       | Delete a rewards program status |

### Rewards Program Point Valuations

| Method | Route                                             | Authentication | Description              |
| ------ | ------------------------------------------------- | -------------- | ------------------------ |
| GET    | `/api/v1/my/rewards-program-point-valuations`     | Required       | List point valuations    |
| POST   | `/api/v1/my/rewards-program-point-valuations`     | Required       | Create a point valuation |
| PATCH  | `/api/v1/my/rewards-program-point-valuations/:id` | Required       | Update a point valuation |
| DELETE | `/api/v1/my/rewards-program-point-valuations/:id` | Required       | Delete a point valuation |
