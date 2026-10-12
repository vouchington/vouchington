# Crawl Dispatch Worker

Source entrypoint: [backend/workers/crawl-dispatch/README.md](../../../../../../backend/workers/crawl-dispatch/README.md)

`crawlDispatch` runs the [shared crawl-dispatch queue](../../crawl-dispatch/README.md) as a CPU worker with a dedicated command client and baseline concurrency 8. Its hostname processor retains bounded sweep cursors and awaited child enqueues. Its boilerplate processor retains bounded candidate selection and native HTML extraction with the same database effects.

The domain pages document [hostname dispatch](../crawl-hostnames/README.md) and [boilerplate removal](../crawl-boilerplate-removal/README.md) in detail.
