# @services/post-content-limits

Valkey-backed dynamic configuration for post content payload limits.

## Key exports

- `postContentLimitsConfig` — a `DynamicConfig` instance for post content caps.
- `getPostContentLimitsConfig` — returns the current caps with validated fallback defaults.
- `DEFAULT_POST_CONTENT_LIMITS` — default caps used when config is unset or invalid.
- `POST_CONTENT_LIMITS_MIN_VALUES` — minimum accepted values for each cap.

## Usage

```typescript
import { getPostContentLimitsConfig } from '@services/post-content-limits'

const { data_point_topic_ids_max_items } = getPostContentLimitsConfig()
```

## Related

- API: [../../api/v1/dynamic-config/](../../api/v1/dynamic-config/README.md) namespace `post-content-limits-config`
- Dynamic config audit: [../dynamic-config-audit/](../dynamic-config-audit/README.md)
- Posts service: [../posts/](../posts/README.md)
