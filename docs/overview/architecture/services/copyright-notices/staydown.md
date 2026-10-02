# Copyright staydown

Part of [`@services/copyright-notices`](README.md). The behaviour and its legal basis are in
[staydown matching](../../../../requirements/moderation/COPYRIGHT-NOTICES.md#staydown-matching);
this page records where the code lives.

While `copyright.staydownMatching` is on (off at launch, pending counsel's decision on DSM Article
17 staydown), a moderator-confirmed restriction registers its images in `copyright_staydown_entries`
inside the confirming transaction. `applyCopyrightConfirmationConsequencesInTransaction` in
`staydown-registration.mts` runs there beside the repeat-infringer sync, from acceptance,
mandatory human review, and appeal review. Automated provisional withholding and reversed
restrictions never register. Lifting a restriction (`liftCopyrightRestrictionInTransaction`) or
creating its reversal restore intent deletes the entry, which cascades to its
`copyright_staydown_matches`.

Upload matching is in `staydown-matches.mts`: the exact SHA-256 match comes from the images
completion route, and the perceptual dHash match from the `staydown-hash` images-queue job. A match
creates a staff-queue item with the `staydown_review` reason and never blocks, hides, or delays the
upload. The staff read model is `read-models-staff-staydown.mts`; reviewing a match is
`staydown-review.mts`.

The poster restriction notices live in `restriction-poster-notices.mts`, split from
`restrictions.mts` to keep both files short.
