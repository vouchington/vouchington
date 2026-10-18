# Queue testing boundaries

Backend unit tests use the platform worker-runtime testing adapter to exercise queue processors
without depending on a shared Valkey service. This keeps application behavior tests separate from
transport and server behavior, which requires the real GlideMQ test project or integration suite.

Vitest data projects reuse workers across files in a fork. Product-specific shared workers must
therefore serve only explicitly selected domains, and every test-created worker must close during
cleanup. The [parallel-safety guidance](../../reference-tests-parallel-safety-and-test-root-hygiene.md#live-glidemq-workers-must-not-leak-across-isolatefalse-files)
covers why leaked workers can make another file's result depend on execution order.
