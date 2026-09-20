# Static-asset deployment

[Back to Deployment](deployment.md)

Vouchington dispatches the exact source revision for web static assets, article Markdown, internal
documentation, and Storybook. It does not store destination identifiers or publish those assets
directly.

[`vouchington-infra`](https://github.com/vouchington/vouchington-infra) builds the selected source,
owns destination mapping and provider credentials, performs publication, and records deployment
evidence. Staging deployment is live through that private receiver. Production promotion and
rollback are not live.
