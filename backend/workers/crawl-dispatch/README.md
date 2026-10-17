# @workers/crawl-dispatch

One CPU worker dispatches hostname crawl and HTML boilerplate-removal jobs on `crawl-dispatch`, with baseline concurrency 8 and a dedicated command client. The boilerplate processor retains its bounded HTML selection and native extractor, while hostname sweeps retain their persisted cursors.

See the [worker architecture](../../../docs/overview/architecture/queues/README.md).
