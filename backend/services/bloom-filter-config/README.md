# @services/bloom-filter-config

Valkey-backed dynamic configuration for enabling and disabling individual bloom filters at runtime.

## Key exports

- `bloomFilterConfig` — a `DynamicConfig` instance that controls whether each bloom filter is active. Supported keys: `entity_cache`, `embedding`, `url_blocklist`, `email_blocklist`, `bookmark`.

## Usage

```typescript
import { bloomFilterConfig } from '@services/bloom-filter-config'

const isEnabled = await bloomFilterConfig.get('entity_cache')
```

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Bloom filters system: [../../queues/bloom-filters/README.md](../../queues/bloom-filters/README.md)
- Entity cache: [../entity-cache/README.md](../entity-cache/README.md)
