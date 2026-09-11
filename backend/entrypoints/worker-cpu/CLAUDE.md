# worker-cpu

CPU-intensive workers plus IO-capable queues selected by the local development environment. Rust NAPI (HTML, AI), Lightpanda headless browser (crawl_browser), sharp (images).

Queue placement source: [../../modules/worker-queue-inventory/worker-queue-policy.json](../../modules/worker-queue-inventory/worker-queue-policy.json). CPU-only queues can only run here; all worker queues must be runnable here. `WORKER_CPU_EXTRA_QUEUES` is limited to local development.

See [../../worker-runtime/](../../worker-runtime/) for the shared worker framework.
