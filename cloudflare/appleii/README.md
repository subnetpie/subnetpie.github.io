# Apple II cloud profile backend

This Worker is the first backend slice for cross-device Apple II / IIgs machine persistence.

It keeps the current static emulator intact while adding:

- D1-backed named machine profiles
- R2-backed base disk images
- profile-to-drive disk assignments
- 512-byte writable disk overlays
- optimistic profile revisions through `ETag` / `If-Match`

## Cloudflare resources

Create the resources from `cloudflare/appleii`:

```sh
npx wrangler d1 create appleii-profiles
npx wrangler r2 bucket create appleii-disks
```

Put the returned D1 database id into `wrangler.jsonc`, then initialize the schema:

```sh
npx wrangler d1 execute appleii-profiles --remote --file=schema.sql
```

Create a private API token used by the emulator during the first development phase:

```sh
npx wrangler secret put SYNC_TOKEN
```

Do not commit the token or embed it in the public GitHub repository.

For local development:

```sh
npx wrangler dev
```

Deploy with:

```sh
npx wrangler deploy
```

## API

All `/api/*` routes except `/api/health` require:

```text
Authorization: Bearer <SYNC_TOKEN>
```

Primary routes:

```text
GET  /api/health
GET  /api/profiles/:profileId
PUT  /api/profiles/:profileId
GET  /api/disks/:diskId
PUT  /api/disks/:diskId
PUT  /api/profiles/:profileId/drives/:driveId/disk
DELETE /api/profiles/:profileId/drives/:driveId/disk
GET  /api/profiles/:profileId/drives/:driveId/overlay
GET  /api/profiles/:profileId/drives/:driveId/blocks/:block
PUT  /api/profiles/:profileId/drives/:driveId/blocks/:block
```

Overlay block uploads must be exactly 512 bytes.

## Deployment transition

The existing GitHub Pages site can continue to run while this Worker is tested. Once profile sync is stable, deploy the emulator and API under the same Cloudflare hostname so browser requests become same-origin.

The initial bearer-token gate is intentionally simple and private. Before exposing profile sync to multiple users, replace it with Cloudflare Access or another per-user authentication layer.
