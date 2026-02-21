# Technical Specification: Local Tile Caching for OpenStreetMap (OSM)

## 1. Project Objective
Implement a local caching layer for the fixed-radius service area so the map no longer stutters, times out, or shows a blank screen when OpenStreetMap tiles cannot be streamed immediately.

---

## 2. Core Problem Diagnostics
When the map goes blank it is usually because:
- **Missing CSS:** `leaflet.css` must load before the JavaScript bundle so the map container sizes correctly.
- **Container Height:** `#map` (or the leaflet container div) needs an explicit height (e.g., `height: 500px`) because Leaflet will render at 0px otherwise.
- **Rate Limiting:** OSM blocks bursts of tile requests if they come from a generic `User-Agent`, so a unique identifier plus caching is required.

---

## 3. Implementation Strategy: Leaflet + PouchDB
Because the app operates within a bounded area, we can cache tiles with `PouchDB` (which uses IndexedDB in the browser) and a Leaflet caching plugin.

### A. Required Dependencies
1. **Leaflet.js** – the base mapping library.
2. **PouchDB** – stores tiles locally.
3. **Leaflet.TileLayer.PouchDBCached** – the wrapper that lets Leaflet read/write tiles via PouchDB.

### B. Configuration Script

```javascript
// 1. Initialize map.
const map = L.map("map").setView([LAT, LNG], 15);

// 2. Layer with caching.
const osmLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "&copy; OpenStreetMap",
  useCache: true,
  crossOrigin: true,
  cacheMaxAge: 604800000, // 7 days
  userAgent: "MySpecificApp_v1.0",
});

osmLayer.addTo(map);

// 3. Force Leaflet to recalculate size (fix for hidden containers/ tabs).
map.invalidateSize();

// 4. Seed the cache for the service area (cover zooms 12–17).
const bbox = L.latLngBounds(southWestCorner, northEastCorner);
osmLayer.seed(bbox, 12, 17);
```

Use the seed call to pre-download tiles for the known service area once so subsequent visits render instantly even if OSM rate limits the live requests.
