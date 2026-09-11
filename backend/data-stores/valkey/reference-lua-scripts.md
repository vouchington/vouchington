# Lua Scripts

[Back to Valkey Data Store](README.md#lua-scripts)

Use `loadScript()` and `registerScript()` from `@data-stores/valkey/scripts`; those are re-exported from `valkyries`.

Store application-owned Lua scripts beside the code that invokes them, under a local `scripts/`
directory. Primitive cache, Bloom filter, conditional operation, dynamic config, idempotency-key,
and rate limiter scripts are packaged by `valkyries`.

```ts
import { loadScript, registerScript } from '@data-stores/valkey/scripts'

const script = registerScript(loadScript('my-script.lua', import.meta.url))
await sessionValkeyClient.invokeScript(script, { keys, args })
```
