# Build handoff

## Recommended implementation order

1. Establish green builds and tests from the current checkout; record versions and commit SHA.
2. Extract internal server modules without changing the public API or provider contract.
3. Harden sessions, user isolation, readiness, structured logs, and secret redaction.
4. Add AniList cache/coalescing and provider-specific concurrency/rate limits.
5. Complete responsive browser flows and accessibility acceptance.
6. Add backup/restore/rollback automation and test it on staging.
7. Run the capacity profiles and publish the tested envelope.
8. Present screenshots, functional evidence, security evidence, and the operating runbook for owner approval.

No production deployment is implied by completing these steps.

## Evidence bundle required for review

- source commit SHA and dependency lockfiles;
- architecture/API changes and migration notes;
- frontend, Rust, provider fixture, and browser test results;
- English and Vietnamese provider certification results, including degraded sources;
- desktop and mobile screenshots for every primary journey;
- accessibility and reduced-motion results;
- container image digest and software bill of materials;
- restored staging database checksum and restore duration;
- rollback rehearsal result;
- capacity report with the safe alert threshold;
- sample commands for status, logs, metrics, backup, restore, and rollback.

## Technology selection rule

The default is the existing React/Vite frontend and Rust/Axum modular monolith because it preserves provider logic and minimizes deployables. A builder may propose another stack, but must first produce a written comparison against the rewrite criteria in `08-capacity-cost-evolution.md`. The proposal must improve measurable quality, sustainability, or total cost—not only developer familiarity.

## Provider implementation rule

Every enabled provider needs:

- deterministic parser fixtures;
- search, details, episode, stream, subtitle, and error-state coverage appropriate to its capabilities;
- timeouts and bounded retry behavior;
- redacted diagnostics and a stable health/degraded state;
- an independently recorded English or Vietnamese certification result;
- a user-visible verification path when anti-bot behavior prevents safe automation.

Never silently route a selected provider through a different catalog.
