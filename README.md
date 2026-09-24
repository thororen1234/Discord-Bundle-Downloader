# Discord Bundle Downloader

Watches Discord's web client for new builds and archives every webpack module each build ships. It's a Next.js
remake of `explorer_server` from [sadan.zip](https://github.com/sadan4/sadan.zip), the service behind
`s-d-br.sadan.zip`. It serves the same API and uses the same on-disk format, so existing clients and existing
`builds/` directories work with it unchanged.

It also has a small web UI for browsing builds, searching module source and following module dependencies.

## How it works

- **Tracking** works like Equibot's `discordTracker`: every 30 seconds it requests `/app` on each tracked channel
  and compares the `x-build-id` header. A hash it hasn't stored yet gets scraped.
- **Chunk loading** follows Equicord's lazy chunk loader. `web.<hash>.js` runs in a `node:vm` sandbox with a
  `Function.prototype.m` setter trap to capture webpack's require. The full chunk map comes out of `wreq.u` with
  a symbol getter on `Object.prototype`. Every chunk is then fetched and run against a fake
  `webpackChunkdiscord_app` whose `push` collects the module factories. Chunk ids found in `.e("…")` calls in
  new modules are queued too.
- **Dependencies** (`depInfo`) are worked out per module from calls on the factory's require parameter:
  `n(123)` is sync, `n.bind(n,123)` and `n.t.bind(n,123,…)` are lazy.

On one live build this found every module `explorer_server` stored, plus about 3,800 it missed from the initial
HTML chunks. It also matched all but one of its dependency edges.

The vm sandbox is not a security boundary. It only ever runs code served by discord.com.

## Running

Needs Node 22.15+ (for `zlib` zstd) and pnpm.

```bash
pnpm install
pnpm dev
```

Production is a long-running Node server. The tracker runs in-process and builds live on disk, so serverless
hosting won't work.

```bash
pnpm build && pnpm start
docker build --build-arg GIT_HASH=$(git rev-parse HEAD) -t discord-bundle-downloader .
docker run -p 8484:8484 -v ./data:/data discord-bundle-downloader
```

Settings are environment variables. See [.env.example](.env.example) for all of them. The main ones:

| Variable | Default | |
| --- | --- | --- |
| `DATA_DIR` | working directory | Directory holding `builds/` |
| `TRACK_CHANNELS` | `stable` | `stable`, `canary` or `stable,canary` |
| `TRACKER_ENABLED` | `true` | `false` serves stored builds without polling |
| `ADMIN_TOKEN` | unset | Enables `POST /fixup-timestamps` |

### Scripts

```bash
pnpm scrape [stable|canary] [--dry-run]         # scrape the current build once, no server needed
pnpm mirror [--base-url https://s-d-br.sadan.zip]  # copy every build from another server into DATA_DIR
```

## API

Same routes and encodings as `explorer_server`. Every response has `Access-Control-Allow-Origin: *`.

| Route | Response |
| --- | --- |
| `GET /builds` | msgpack `{ builds }`, each entry a raw `meta.mpk.zst` as an array of bytes |
| `GET /builds/latest/meta` | msgpack `BundleMetadata` |
| `GET /builds/before/time/{unix ms}` | msgpack `{ before, after: null }` |
| `GET /builds/before/hash/{hash}` | msgpack `{ before, after: null }` |
| `GET /build/{hash}/metadata` | `meta.mpk.zst` (zstd msgpack `BundleMetadata`) |
| `GET /build/{hash}/full` | `data.mpk.zst` (zstd msgpack `FullBundle`) |
| `GET /build/archive/{hash}.7z` | `.modules/{id}.js`, `deps.json`, `info.json`, `modules.json`, saved as `{channel}-{build number}-{hash}.7z` |
| `GET /version` | git commit |
| `POST /fixup-timestamps` | sets build directory mtimes to their first-seen time |

What's different from `explorer_server`:

- `latest` and `before` routes take `?channel=stable|canary|all`. They default to `stable`, which keeps the old
  behaviour when canary is also tracked. `/builds` takes the same parameter but defaults to all.
- Every build says which channel it came from. `BundleMetadata` has an extra `channels` field: `["stable"]`,
  `["canary"]`, or `["stable", "canary"]` for a canary build that was later promoted with the same hash. serde
  ignores unknown fields, so explorer_server clients are unaffected. Builds from explorer_server don't have the
  field on disk. They were all stable, so the metadata routes and `info.json` report them as `["stable"]`.
  `/build/{hash}/full` serves their untouched `data.mpk.zst`.
- `.7z` archives are cached next to the build for 7 days instead of in redis. New builds get theirs prebuilt.
- A failed scrape is retried with backoff instead of leaving an empty build directory behind.
- `/fixup-timestamps` needs `Authorization: Bearer $ADMIN_TOKEN` and is off when no token is set.

## Storage

```
builds/.ver                  format version (5, same as explorer_server)
builds/<hash>/meta.mpk.zst   zstd(msgpack(BundleMetadata))
builds/<hash>/data.mpk.zst   zstd(msgpack(FullBundle))
builds/<hash>/archive.7z     cached archive
```

Maps keyed by module id are written with integer keys, and `firstSeen` is written as an integer, so
`rmp_serde` can read these files back.
