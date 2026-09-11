# Crawl Boilerplate Removal Worker

Worker package for boilerplate removal dispatch and page-content cleanup jobs.

HTML snapshots stay as owned temp files while the worker validates UTF-8 and selects the smallest
files that fit the native library's 10 MiB aggregate input cap. Native extraction is serialized per
process, and only that selected corpus is materialized for the current buffer-only Vurst API. Every
downloaded artifact is removed after success, skip, or failure.

## Exports

- `boilerplateRemoval` - worker instance for the `crawl_html_boilerplate_removal` queue.

## Related

- Queue surface: [../../queues/crawl-boilerplate-removal/README.md](../../queues/crawl-boilerplate-removal/README.md)
- Worker entrypoint: [../../entrypoints/worker-cpu/README.md](../../entrypoints/worker-cpu/README.md)
