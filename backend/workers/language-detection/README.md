# language-detection worker

CPU-bound worker that processes `language_detection` queue jobs.

Calls the `lingua-rs` N-API addon (75 languages, async libuv threadpool)
via a thin service layer that:

1. Skips detection when `lingua_rs_input_sha256` matches the current detection key (idempotent)
2. Uses declared/extracted language (RSS `<language>`, crawl `<html lang>`, post `language` field) when available
3. Otherwise calls `detectLanguage(Buffer)` and stores the raw JSONB result

## See also

- Queue: [`@queues/language-detection`](../../queues/language-detection/README.md)
- Service: [`@services/language-detection`](../../services/language-detection/README.md)
