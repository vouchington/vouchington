# Email Digests Worker

Source entrypoint: [backend/workers/email-digests/README.md](../../../../../../backend/workers/email-digests/README.md)

Handlers for the [`email-digests` domain](../../email-digests/README.md) of the `background` queue.
There is no worker of its own: the [background worker](../background/README.md) runs
`emailDigestsHandlers`.

## Exports

- `emailDigestsHandlers` - one handler per registered job. Each routes through
  `processEmailDigestJob`, which parses the payload against the job's enqueue contract before the
  dispatcher or template processor runs.

Recipient resolution is shared with the [emails worker](../emails/README.md).
