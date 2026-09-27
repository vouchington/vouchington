# worker-cpu

CPU-intensive workers plus all IO-capable queues in local development. Rust NAPI (HTML, AI), Lightpanda headless browser (crawl_browser), sharp (images).

Queue placement source: [../../modules/worker-queue-inventory/worker-queue-policy.json](../../modules/worker-queue-inventory/worker-queue-policy.json). CPU-only queues can only run here; all worker queues must be runnable here.

See [../../worker-runtime/](../../worker-runtime/) for the shared worker framework.
