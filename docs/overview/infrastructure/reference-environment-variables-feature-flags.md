# Environment Variables reference

[Back to Environment Variables](environment-variables.md)

## Feature Flags

| Name                                         | Required | Where          | Notes                                                                                                                                      |
| -------------------------------------------- | -------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `FEATURE_FLAG_COOKIE_MAX_LENGTH`             | No       | ECS            | Backend max accepted encoded `ff` cookie value length before decode/parse. Defaults to `4096`; invalid values fall back to the default     |
| `NEXT_PUBLIC_FEATURE_FLAG_COOKIE_MAX_LENGTH` | No       | Runtime public | Web/client max accepted encoded `ff` cookie value length before decode/parse or safe forwarding. Defaults to `4096`; keep aligned if tuned |
