# Payments (Microsoft Store)

| Variable                         | Where set              | Purpose                                                              |
| -------------------------------- | ---------------------- | -------------------------------------------------------------------- |
| `MICROSOFT_STORE_APPLICATION_ID` | ECS backend and worker | Expected Store application identity; required in production.         |
| `MICROSOFT_STORE_TENANT_ID`      | ECS backend and worker | Microsoft Entra tenant for Store service access.                     |
| `MICROSOFT_STORE_CLIENT_ID`      | ECS backend and worker | Dedicated Store service application ID, distinct from sign-in OAuth. |
| `MICROSOFT_STORE_CLIENT_SECRET`  | SM backend and worker  | Dedicated Store service secret, never sent to clients.               |

The signed-in service-ticket endpoint exchanges these credentials for short-lived Collections and
Purchase access tokens. Windows uses those tickets to obtain user Store ID keys. Workers retain only
encrypted, expiring Store ID keys and recheck known sources while usable. Provisioning and live
sandbox validation are part of the private deployment handoff before enabling Microsoft purchases.
