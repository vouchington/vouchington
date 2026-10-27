# Topic merge worker

The worker passes an operation id and committed generation to the topic service. The service
locks the operation, processes one bounded stage page in one transaction, and returns the next
generation. The worker then admits the next page. Recovery scans stalled operations in a
separate dispatcher lane and uses the same page enqueue API.
