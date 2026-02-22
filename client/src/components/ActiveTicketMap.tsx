import { type ReactNode, useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { TicketStatus, TicketType } from "@shared/schema";

declare module "leaflet" {
  function heatLayer(
    latlngs: Array<[number, number, number?]>,
    options?: {
      minOpacity?: number;
      maxZoom?: number;
      max?: number;
      radius?: number;
      blur?: number;
      gradient?: Record<number, string>;
    }
  ): L.Layer;
}

function extractCoordinates(url: string): { lat: number; lng: number } | null {
  if (!url) return null;
  const patterns = [
    /@([-\d.]+),([-\d.]+)/,
    /q=([-\d.]+),([-\d.]+)/,
    /place\/([-\d.]+),([-\d.]+)/,
    /ll=([-\d.]+),([-\d.]+)/,
    /center=([-\d.]+),([-\d.]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }
  }
  return null;
}

interface TicketPoint {
  id: number;
  ticketIdCustom?: string;
  ticketNumber?: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  customerName: string;
  lat: number;
  lng: number;
  customerLocationUrl?: string;
  slaDeadline?: string | null;
  isActive: boolean;
  performStatus?: string;
  assignees?: { id: number; name: string }[];
  createdAt?: string;
}

interface ActiveTicketMapProps {
  tickets: any[];
  isLoading: boolean;
}

const priorityIntensity: Record<string, number> = {
  critical: 1.0,
  high: 0.8,
  medium: 0.6,
  low: 0.4,
};

const typeColorMap: Record<string, { fill: string; stroke: string }> = {
  installation: { fill: "rgba(59, 130, 246, 0.25)", stroke: "#3b82f6" },
  home_maintenance: { fill: "rgba(245, 158, 11, 0.25)", stroke: "#f59e0b" },
  backbone_maintenance: { fill: "rgba(239, 68, 68, 0.25)", stroke: "#ef4444" },
};

const ASSIGNED_STATUSES = new Set([TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS]);
const INACTIVE_STATUSES = new Set([TicketStatus.CLOSED, TicketStatus.REJECTED]);
const OVERDUE_COLOR = "#ef4444";
const PENDING_COLOR = "#f97316";
const LEGEND_PERSON_COLOR = "#3b82f6";
const LEGEND_SHAPE_COLOR = PENDING_COLOR;
const MARKER_BASE_SIZE = 32;
const PERSON_MARKER_SIZE = MARKER_BASE_SIZE * 2;

export function ActiveTicketMap({ tickets, isLoading }: ActiveTicketMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const heatLayerRef = useRef<L.Layer[]>([]);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const seededRef = useRef<boolean>(false);

  const points: TicketPoint[] = useMemo(() => {
    if (!tickets) return [];
    return tickets
      .map((t: any) => {
        let lat: number | null = null;
        let lng: number | null = null;
        if (t.latitude && t.longitude) {
          lat = parseFloat(t.latitude);
          lng = parseFloat(t.longitude);
        }
        if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) {
          const coords = extractCoordinates(t.customerLocationUrl || "");
          if (coords) {
            lat = coords.lat;
            lng = coords.lng;
          }
        }
        if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) return null;
        const isActive = !INACTIVE_STATUSES.has(t.status);
        if (!isActive) return null;
        return {
          id: t.id,
          ticketIdCustom: t.ticketIdCustom,
          ticketNumber: t.ticketNumber,
          title: t.title,
          status: t.status,
          priority: t.priority,
          type: t.type,
          customerName: t.customerName,
          customerLocationUrl: t.customerLocationUrl,
          lat,
          lng,
          slaDeadline: t.slaDeadline,
          isActive,
          performStatus: t.performStatus,
          assignees: t.assignees,
          createdAt: t.createdAt,
        };
      })
    .filter(Boolean) as TicketPoint[];
  }, [tickets]);

  const technicianPoints = useMemo(() => {
    return points.filter((pt) => pt.assignees && pt.assignees.length > 0 && ASSIGNED_STATUSES.has(pt.status));
  }, [points]);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const defaultCenter: [number, number] = [-6.2, 106.8];

    const map = L.map(mapRef.current, {
      center: defaultCenter,
      zoom: 12,
      zoomControl: true,
      attributionControl: true,
    });

    const cachedLayer = L.tileLayer("/api/map-tiles/{z}/{x}/{y}", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      useCache: true,
      saveToCache: true,
      cacheMaxAge: 604800000,
      crossOrigin: true,
      userAgent: "NetGuard-OpenMaps/1.0",
    }).addTo(map);
    tileLayerRef.current = cachedLayer;

    markerLayerRef.current = L.layerGroup().addTo(map);
    mapInstance.current = map;
    map.invalidateSize();

    return () => {
      map.remove();
      mapInstance.current = null;
      tileLayerRef.current = null;
      seededRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!tileLayerRef.current || seededRef.current || points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    const paddedBounds = bounds.pad(0.1);
    seededRef.current = true;
    void seedServerTiles(paddedBounds, 12, 17);
  }, [points]);

  useEffect(() => {
    if (!mapInstance.current) return;
    const map = mapInstance.current;

    if (heatLayerRef.current.length > 0) {
      heatLayerRef.current.forEach((layer) => map.removeLayer(layer));
      heatLayerRef.current = [];
    }
    if (markerLayerRef.current) {
      markerLayerRef.current.clearLayers();
    }
    if (points.length === 0) return;

    const heatData: Array<[number, number, number]> = technicianPoints.map((pt) => {
      const intensity = priorityIntensity[pt.priority] || 0.5;
      return [pt.lat, pt.lng, intensity];
    });
    if (heatData.length > 0) {
      const heat = L.heatLayer(heatData, {
        radius: 30,
        blur: 20,
        maxZoom: 17,
        minOpacity: 0.3,
        max: 1.0,
        gradient: {
          0.0: "#0000ff",
          0.2: "#00bfff",
          0.4: "#00ff80",
          0.6: "#ffff00",
          0.8: "#ff8000",
          1.0: "#ff0000",
        },
      });
      heat.addTo(map);
      heatLayerRef.current.push(heat);
    }

    const now = Date.now();
    points.forEach((pt) => {
      const colors = typeColorMap[pt.type] || typeColorMap.installation;
      const assigned = ASSIGNED_STATUSES.has(pt.status);
      const overdue = pt.slaDeadline ? new Date(pt.slaDeadline).getTime() < now : false;
      const baseColor = overdue ? OVERDUE_COLOR : PENDING_COLOR;

      const icon = assigned
        ? createPersonIcon(colors.stroke)
        : pt.type === TicketType.INSTALLATION
          ? createCircleIcon(baseColor, overdue)
          : createTriangleIcon(baseColor, overdue);

      const marker = L.marker([pt.lat, pt.lng], { icon }).addTo(markerLayerRef.current!);

      const ticketLabel = escapeHtml(pt.ticketIdCustom || pt.ticketNumber || pt.id);
      const technicians = pt.assignees?.map((a) => a.name).filter(Boolean) ?? [];
      const tech1 = escapeHtml(technicians[0] || "Unassigned");
      const tech2 = escapeHtml(technicians[1] || "—");
      const customerName = escapeHtml(pt.customerName);
      const ticketTitle = escapeHtml(pt.title);

      marker.bindPopup(
        `<a href="/tickets/${pt.id}" class="block text-left text-sm" style="color:inherit;text-decoration:none">
           <div style="font-weight:600;margin-bottom:4px">Ticket ID: ${ticketLabel}</div>
           <div style="font-size:12px;margin-bottom:2px">Technician 1: ${tech1}</div>
           <div style="font-size:12px;margin-bottom:2px">Technician 2: ${tech2}</div>
           <div style="font-size:12px;margin-bottom:2px">Customer: ${customerName}</div>
           <div style="font-size:12px;margin-bottom:2px">Title: ${ticketTitle}</div>
         </a>`,
        { closeButton: false }
      );
      marker.on("click", () => {
        window.location.href = `/tickets/${pt.id}`;
      });
      marker.on("mouseover", () => {
        marker.openPopup();
      });
      marker.on("mouseout", () => {
        marker.closePopup();
      });
    });

    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [points, technicianPoints]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Active Ticket Map
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full rounded-md" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-active-ticket-map">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Active Ticket Map
          </CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Legend icon={<TriangleLegendIcon color={LEGEND_SHAPE_COLOR} />} label="Home & Backbone Maintenance" />
              <Legend icon={<CircleLegendIcon color={LEGEND_SHAPE_COLOR} />} label="Home Installation" />
              <Legend icon={<PersonLegendIcon color={LEGEND_PERSON_COLOR} />} label="Assigned / In Progress" />
            </div>
            <span className="text-xs text-muted-foreground" data-testid="text-ticket-count">
              {points.length} active tickets mapped
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {points.length === 0 ? (
          <div className="h-[400px] flex items-center justify-center text-muted-foreground text-sm rounded-md border border-dashed">
            No tickets with location data
          </div>
        ) : (
          <div
            ref={mapRef}
            className="h-[400px] w-full rounded-md overflow-hidden border border-border"
            data-testid="map-active-tickets"
          />
        )}
      </CardContent>
    </Card>
  );
}

interface LegendProps {
  label: string;
  icon?: ReactNode;
  color?: string;
}

function Legend({ icon, color, label }: LegendProps) {
  return (
    <div className="flex items-center gap-1.5">
      {icon ?? (
        <span
          className="inline-block w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: color ?? LEGEND_SHAPE_COLOR }}
        />
      )}
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function TriangleLegendIcon({ color }: { color: string }) {
  return (
    <span
      className="inline-block"
      style={{
        width: 12,
        height: 12,
        clipPath: "polygon(50% 0, 0 100%, 100% 100%)",
        backgroundColor: color,
      }}
    />
  );
}

function CircleLegendIcon({ color }: { color: string }) {
  return (
    <span
      className="inline-flex items-center justify-center"
      style={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        border: `2px solid ${color}`,
      }}
    >
      <span
        style={{
          width: 4,
          height: 4,
          borderRadius: "50%",
          backgroundColor: color,
        }}
      />
    </span>
  );
}

function PersonLegendIcon({ color }: { color: string }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full"
      style={{ width: 14, height: 14, backgroundColor: color }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="7" r="3" />
        <path d="M5 20c0-3.314 2.686-6 6-6h2c3.314 0 6 2.686 6 6" />
      </svg>
    </span>
  );
}

function escapeHtml(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const text = String(value).trim();
  if (text === "") return "—";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createTriangleIcon(color: string, isFlashing = false, size = MARKER_BASE_SIZE + 2) {
  const html = `
    <span class="${isFlashing ? "map-icon-flash" : ""}" style="
      display:inline-block;
      width:${size}px;
      height:${size}px;
      clip-path:polygon(50% 0, 0 100%, 100% 100%);
      background:${color};
      box-shadow:0 6px 18px rgba(15,23,42,0.35);
    "></span>
  `;
  return L.divIcon({
    className: "",
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size * 0.75],
  });
}

function createCircleIcon(color: string, isFlashing = false, size = MARKER_BASE_SIZE) {
  const innerSize = Math.max(6, Math.floor(size / 5));
  const html = `
    <span class="${isFlashing ? "map-icon-flash" : ""}" style="
      display:inline-flex;
      justify-content:center;
      align-items:center;
      width:${size}px;
      height:${size}px;
      border-radius:50%;
      border:3px solid ${color};
      background:rgba(255,255,255,0.15);
      box-shadow:0 6px 18px rgba(15,23,42,0.35);
    ">
      <span style="
        width:${innerSize}px;
        height:${innerSize}px;
        border-radius:50%;
        background:${color};
      "></span>
    </span>
  `;
  return L.divIcon({
    className: "",
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size * 0.75],
  });
}

const PERSON_ICON_SVG = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="8" r="3" />
    <path d="M5 21c0-3.314 2.686-6 6-6h2c3.314 0 6 2.686 6 6" />
  </svg>
`;

function createPersonIcon(color: string, size = PERSON_MARKER_SIZE) {
  const html = `
    <span style="
      display:inline-flex;
      justify-content:center;
      align-items:center;
      width:${size}px;
      height:${size}px;
      border-radius:50%;
      background:${color};
      box-shadow:0 6px 18px rgba(15,23,42,0.35);
    ">
      ${PERSON_ICON_SVG}
    </span>
  `;

  return L.divIcon({
    className: "",
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}

const MAX_PREFETCH_TILES = 256;

function clampTileIndex(value: number, maxIndex: number) {
  if (value < 0) return 0;
  if (value > maxIndex) return maxIndex;
  return value;
}

function latLngToTileIndex(lat: number, lng: number, zoom: number) {
  const latRad = (lat * Math.PI) / 180;
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(
    (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n,
  );
  return {
    x: clampTileIndex(x, n - 1),
    y: clampTileIndex(y, n - 1),
  };
}

async function seedServerTiles(bounds: L.LatLngBounds, minZoom: number, maxZoom: number) {
  let fetched = 0;
  for (let z = minZoom; z <= maxZoom && fetched < MAX_PREFETCH_TILES; z++) {
    const northWest = bounds.getNorthWest();
    const southEast = bounds.getSouthEast();
    const topTile = latLngToTileIndex(northWest.lat, northWest.lng, z);
    const bottomTile = latLngToTileIndex(southEast.lat, southEast.lng, z);
    const minX = Math.min(topTile.x, bottomTile.x);
    const maxX = Math.max(topTile.x, bottomTile.x);
    const minY = Math.min(topTile.y, bottomTile.y);
    const maxY = Math.max(topTile.y, bottomTile.y);

    for (let x = minX; x <= maxX && fetched < MAX_PREFETCH_TILES; x++) {
      for (let y = minY; y <= maxY && fetched < MAX_PREFETCH_TILES; y++) {
        fetched += 1;
        try {
          await fetch(`/api/map-tiles/${z}/${x}/${y}`, { cache: "force-cache" });
        } catch {
          // ignore failed requests, the cache is best-effort
        }
      }
    }
  }
}
