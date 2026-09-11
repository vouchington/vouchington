# UI Components reference

[Back to UI Components](COMPONENTS.md)

## RSC boundary view models

Normalized API envelopes stay on the server when only a subset is interactive. Server projectors
construct serializable display models, precompute canonical hrefs where practical, and retain only
records and sidecars referenced by rendered result IDs. Failed requests remain `null`; successful
responses with no displayable records remain `[]`.

The homepage projects all five preview responses before passing data or promises to client
components. Comment threads project posts plus their HTML, elections, votes, bookmarks, and
moderation records; orphaned normalized records and pagination metadata do not cross Flight.
`PostList` retains the raw response because it fetches subsequent pages in the browser and merges
every response field. New exceptions require an inline AST-grep ignore explaining that data flow.

## Design System

- **Framework**: [shadcn/ui](https://ui.shadcn.com) (new-york style)
- **Base color**: zinc
- **CSS**: Tailwind CSS v4
- **Icons**: [lucide-react](https://lucide.dev)
- **Toasts**: [sonner](https://sonner.emilkowal.ski)
- **Policy**: shadcn component usage is required — no raw `<button>`, `<input>`, `<select>`,
  `<textarea>`, or `<label>` outside `web/components/ui/`. Automated replacement coverage for
  this policy is tracked in the static-analysis migration milestone.
