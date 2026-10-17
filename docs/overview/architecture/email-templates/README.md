# Email Templates

React Email templates for all Voucha emails live in [`email-templates/`](../../../../email-templates/README.md). The template list, subjects and props are code.

- Templates whose props include `physicalAddress` are commercial or marketing email and must render both a physical mailing address and a visible unsubscribe link, per CAN-SPAM. `MarketingFooter` supplies them and a test enforces it for every such template.
- Templates are rendered at build time into a bundle so React Email and its preview server stay development-only dependencies.
- Recommendation-style emails share one layout so new ones are built on it rather than copied.
- Email delivery guarantees are described in the [queues map](../queues/README.md).
