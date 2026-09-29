# Engagement Emails Service

Source entrypoint: [backend/services/engagement-emails/README.md](../../../../../backend/services/engagement-emails/README.md)

Dispatches scheduled engagement recommendation emails.

This package owns the cross-service recommendation queries for engagement email jobs and enqueues
the rendered email jobs onto `@queues/emails`. Send claim and sent-state helpers remain in
`@services/users/engagement-emails` because they write user-owned tracking tables.
