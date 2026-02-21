# Technical Specification: Server-backed Tile Caching (OpenStreetMap)

## 1. Objective
The map should render reliably even when OpenStreetMap rate-limits or drops tiles for a bursty client. Instead of bundling an in-browser database, we cache the tiles in Postgres so every browser can stream them from our API and optionally reuse a pre-seeded cache for the known service area.

## 2. Problem Summary
Blank tiles are typically due to:

- **Rate limiting:** OSM rejects too many concurrent requests without a unique `User-Agent`. Every browser request must travel through our API, which adds a distinct agent string for tracking.
- **Transient outages:** When a tile request fails, we still keep the previously cached version in Postgres, so refreshing is fast.
- **Cold starts:** We seed the most common tiles on the client side once (for the bounding box that the technicians usually operate inside), so the subsequent navigation comes from IndexedDB or browser cache instead of hitting OSM again.

## 3. Caching Flow

1. **Server route:** `/api/map-tiles/:z/:x/:y` first looks in the `map_tiles` table, returning the `tileData` with a long `Cache-Control` header if present. If the tile is missing, the server fetches it from `https://tile.openstreetmap.org`, stores it (encoded as base64), and then returns the raw binary to the client. Every fetch includes the header `"User-Agent": "NetGuard-OpenMaps/1.0"`.

2. **Client map layer:** `ActiveTicketMap` uses `L.tileLayer("/api/map-tiles/{z}/{x}/{y}")` with `crossOrigin`, `cacheMaxAge`, and the custom `userAgent` options. The component now stores the created tile layer in `tileLayerRef` so we can seed it once the ticket coordinates arrive.

3. **Seeding:** Once the map has points, the component calculates a padded `LatLngBounds` covering active ticket locations and calls the `seed` helper that is defined on the layer (it uses the same `L.TileLayer` object but the seeding logic is implemented beside the map so it simply loops over every tile in the range and touches it). Because the layer is served from our own `/api/map-tiles` endpoint, seeding primes the Postgres cache rather than hitting OSM directly.

4. **Cleanup:** The map clears the `tileLayerRef`/`seededRef` on unmount, enabling future re-initialization when the component remounts.

## 4. Operational Notes

- The `map_tiles` table uses a composite primary key on `(z, x, y)` and stores the tile as base64 so Postgres avoids raw binary issues.
- Every response sets `Cache-Control: public, max-age=604800` so browsers can reuse cached tiles for seven days.
- When we deploy to production, ensure the `TILE_SERVER_URL` environment variable points to `https://tile.openstreetmap.org` or a mirrored tile server with usage terms.

