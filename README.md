# Discord Bundle Downloader

Tracks Discord web builds and archives every webpack module they ship. A Next.js remake of `explorer_server` from
[sadan.zip](https://github.com/sadan4/sadan.zip) (`s-d-br.sadan.zip`), with the same API and on-disk format.

With `VENDETTA_API_URL` set, the scraper also downloads `assets/index.android.bundle` (Hermes bytecode) of every
Discord Android version that [VendettaAPI](https://github.com/thororen1234/VendettaAPI) reports, and saves it under
`DATA_DIR/android/{versionCode}/`. It polls `/android/index` and, with `VENDETTA_WEBHOOK_SECRET` set, also accepts
VendettaAPI's new-release webhook. See [.env.example](.env.example).

The `compactor` container recompresses builds older than `COMPACT_AFTER_DAYS` (30) at zstd level 22. Files stay plain
zstd, so downloads are unchanged.

| Route | Returns |
| --- | --- |
| `GET /android/builds?channel=alpha\|beta\|stable` | stored Android builds as JSON |
| `GET /android/{versionCode}/bundle` | the raw `index.android.bundle` |
