# Environment Variables reference

[Back to Environment Variables](environment-variables.md)

## Sideload Image Security

Must be set consistently on **both** the backend server (signs URLs in rendered markdown) and the Image Lambda (verifies signatures on incoming requests).

| Name                           | Required     | Where       | Notes                                                                                                                                                                                                                                                                              |
| ------------------------------ | ------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VOUCHA_SIDELOAD_SIGNING_KEYS` | Staging/prod | SM + Lambda | Comma-separated hex-encoded HMAC-SHA256 keys (newest first). ECS injects the SSM value; the image Lambda receives `VOUCHA_SIDELOAD_SIGNING_KEYS_PARAMETER` and fetches the SecureString at runtime. Unset keys are accepted only outside deployed staging/production environments. |
