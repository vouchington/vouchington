# Environment Variables reference

[Back to Environment Variables](environment-variables.md)

## Payments (Apple App Store)

| Name                                     | Required | Where      | Notes                                                   |
| ---------------------------------------- | -------- | ---------- | ------------------------------------------------------- |
| `APPLE_APP_STORE_APPLICATION_ID`         | Yes      | ECS        | StoreKit bundle identifier used for signed-data checks  |
| `APPLE_APP_STORE_APP_ID`                 | Yes¹     | ECS        | Positive numeric App Store app ID for production checks |
| `APPLE_APP_STORE_SERVER_API_ISSUER_ID`   | Yes      | ECS worker | App Store Connect API issuer identifier                 |
| `APPLE_APP_STORE_SERVER_API_KEY_ID`      | Yes      | ECS worker | App Store Connect API key identifier                    |
| `APPLE_APP_STORE_SERVER_API_PRIVATE_KEY` | Yes      | SM worker  | App Store Connect API private key                       |

¹ Sandbox verification omits the numeric app ID. Production signed-data verification requires it.

The backend receives only the bundle and numeric app identifiers. It verifies submitted evidence
and notification payloads offline from Apple's signed data. The worker additionally receives the
server API credentials for authoritative transaction-history and subscription-status reads.
