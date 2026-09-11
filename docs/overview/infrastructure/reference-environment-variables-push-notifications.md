# Environment Variables reference

[Back to Environment Variables](environment-variables.md)

## Push Notifications

| Name                              | Required | Where          | Notes                                          |
| --------------------------------- | -------- | -------------- | ---------------------------------------------- |
| `WEB_PUSH_PUBLIC_KEY`             | Yes      | ECS            | VAPID public key                               |
| `WEB_PUSH_PRIVATE_KEY`            | Yes      | SM             | VAPID private key                              |
| `WEB_PUSH_SUBJECT`                | Yes      | ECS            | VAPID subject (e.g., `mailto:admin@voucha.ai`) |
| `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY` | Yes      | Runtime public | Same VAPID public key, exposed to the browser  |
