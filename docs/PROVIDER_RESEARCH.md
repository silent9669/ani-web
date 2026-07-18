# Provider research and admission record

Checked on 2026-07-18. This record separates ideas found in other projects from
providers that meet ani-desk’s native contract.

## Admission rule

A provider is enabled only when a live test completes all of these steps:

1. Query that provider’s own catalog.
2. Select a plausible title match.
3. Load episodes or the movie entry.
4. Resolve a stream and any required headers.
5. Fetch real media: an HLS/DASH manifest, segment, or native media range.

An iframe homepage returning HTTP 200 is not certification. A source requiring
someone else’s hosted player is not equivalent to an ani-desk provider.

## Repositories inspected

| Repository snapshot | License | Useful findings | Decision |
| --- | --- | --- | --- |
| `pystardust/ani-cli` master `5cfc4b0`, fix branch `6a3a364` | GPL-3.0 | Current AllAnime `aaReq`, build ID, AES-GCM request and AES-CTR response behavior | Independently implemented the observed protocol; no GPL source copied |
| `truelockmc/streambert` `44e0264` | GPL-3.0 | Provider failover memory, source-specific progress, setup/settings/library ideas | Behavioral reference only; no GPL code copied |
| `TomasTNunes/TMDB-Player` `80a0a93` | MIT | Six TMDB-ID iframe player endpoints | Not native providers: no provider-specific catalog search or direct media contract |

## AllAnime repair

AllAnime now sends the current persisted GraphQL request metadata, including its
encrypted `aaReq` value and build identifier, then decrypts the encrypted source
payload before resolving media. The current profile can be changed without a
recompile through:

- `ANI_DESK_ALLANIME_KEY`
- `ANI_DESK_ALLANIME_EPOCH`
- `ANI_DESK_ALLANIME_BUILD_ID`

Live results:

- `One Piece`: search, episodes, stream, and real media passed.
- `Your Name / Kimi no Na wa`: search succeeds, but the tested title currently
  has no playable AllAnime source.

Therefore AllAnime is repaired but should be described as Limited when a
multi-title certification is required. It remains visible and retains the
manual verification path for Cloudflare interruptions.

## Newly enabled: MovieBox

MovieBox was already implemented but previously omitted from the registry after
its signed mobile API returned `miss token`. The same adapter was re-tested
without borrowing code from another repository.

Current live results:

- Provider health flow passed.
- `One Piece`: provider search, episodes, DASH resolution, and real media passed.
- `Your Name`: provider search, movie entry, native MP4 resolution, and real
  media passed.

MovieBox is now enabled as a distinct English provider. It appears separately in
the provider-first picker and does not merge its results into AllAnime or
AnimeGG.

## Sources not admitted

### StreamBert AllManga

StreamBert’s AllManga implementation follows the older AllAnime request shape
without the current encrypted `aaReq` requirement. Its upstream issue tracker
also records the break. It adds no working catalog beyond the repaired native
AllAnime provider.

### StreamBert video players

Videasy, VidSrc, and Vidking are hosted embed/player choices. They are not
provider-specific searchable catalogs and do not satisfy the `AnimeProvider`
search → episodes → direct media contract. StreamBert is GPL-3.0, so its
implementation is not copied into this MIT project.

### TMDB-Player embeds

`vixsrc.to`, `moviesapi.to`, `vidsrc.me`, `player.videasy.net`, `vidfast.pro`,
and `vidlink.pro` take TMDB IDs and render third-party players. They cannot answer
“search this provider’s catalog” and would require loosening ani-desk’s CSP to
allow arbitrary third-party frames. They are intentionally excluded.

### Simindad

The closed ani-cli proposal for `simindad.top` requires a site account, an image
CAPTCHA, a persisted WordPress cookie jar, and direct extraction from protected
pages. That does not fit a reliable shared family service or unattended health
monitoring, so it is excluded.

## Re-certification commands

```bash
cargo test -p ani-desk-core providers::allanime::tests::live_allanime_search_episode_stream_smoke -- --ignored --nocapture
cargo test -p ani-desk-core --test providers_live test_moviebox_live_playback -- --ignored --nocapture
cargo run --example provider_certification -- --require-english
```

The certification example prints media hosts rather than full signed URLs so
tokens do not enter normal logs.
