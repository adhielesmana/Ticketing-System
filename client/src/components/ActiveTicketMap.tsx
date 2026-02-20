import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TicketStatus } from "@shared/schema";

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
  isActive: boolean;
  performStatus?: string;
  assignees?: { id: number; name: string }[];
  createdAt?: string;
}

interface ActiveTicketMapProps {
  tickets: any[];
  isLoading: boolean;
}

type ViewMode = "heatmap" | "markers";

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

const priorityRank = ["critical", "high", "medium", "low"];
const ACTIVE_STATUSES = new Set([
  TicketStatus.OPEN,
  TicketStatus.WAITING_ASSIGNMENT,
  TicketStatus.ASSIGNED,
  TicketStatus.IN_PROGRESS,
]);

export function ActiveTicketMap({ tickets, isLoading }: ActiveTicketMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const heatLayerRef = useRef<L.Layer[]>([]);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const techMarkerRef = useRef<L.CircleMarker | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("heatmap");

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
        return {
          id: t.id,
          ticketIdCustom: t.ticketIdCustom,
          ticketNumber: t.ticketNumber,
          title: t.title,
          status: t.status,
          priority: t.priority,
          type: t.type,
          customerName: t.customerName,
          lat,
          lng,
          isActive: ACTIVE_STATUSES.has(t.status),
          performStatus: t.performStatus,
          assignees: t.assignees,
          createdAt: t.createdAt,
        };
      })
    .filter(Boolean) as TicketPoint[];
  }, [tickets]);

  const technicianPoint = useMemo<TicketPoint | null>(() => {
    const candidates = points.filter((pt) => pt.assignees?.length && pt.isActive);
    if (candidates.length === 0) return null;
    return [...candidates].sort((a, b) => {
      const rankA = priorityRank.indexOf(a.priority);
      const rankB = priorityRank.indexOf(b.priority);
      if (rankA !== rankB) return (rankA === -1 ? priorityRank.length : rankA) - (rankB === -1 ? priorityRank.length : rankB);
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    })[0];
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

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    }).addTo(map);

    markerLayerRef.current = L.layerGroup().addTo(map);
    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapInstance.current) return;
    const map = mapInstance.current;

    if (heatLayerRef.current.length > 0) {
      heatLayerRef.current.forEach(layer => map.removeLayer(layer));
      heatLayerRef.current = [];
    }
    if (markerLayerRef.current) {
      markerLayerRef.current.clearLayers();
    }
    if (techMarkerRef.current) {
      map.removeLayer(techMarkerRef.current);
      techMarkerRef.current = null;
    }

    if (points.length === 0) return;

    if (viewMode === "heatmap") {
      const activePoints = points.filter((pt) => pt.isActive);
      const inactivePoints = points.filter((pt) => !pt.isActive);

      const heatData: Array<[number, number, number]> = activePoints.map((pt) => {
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

      if (inactivePoints.length > 0) {
        const greyHeat = L.heatLayer(
          inactivePoints.map((pt) => [pt.lat, pt.lng, 0.5]),
          {
            radius: 20,
            blur: 10,
            maxZoom: 17,
            minOpacity: 0.2,
            max: 1.0,
            gradient: {
              0.0: "rgba(0,0,0,0)",
              1.0: "rgba(107,114,128,0.8)",
            },
          },
        );
        greyHeat.addTo(map);
        heatLayerRef.current.push(greyHeat);
      }
    } else {
      points.forEach((pt) => {
        const colors = typeColorMap[pt.type] || typeColorMap.installation;

        const marker = L.circleMarker([pt.lat, pt.lng], {
          radius: 7,
          fillColor: pt.isActive ? colors.stroke : "#6b7280",
          fillOpacity: pt.isActive ? 0.95 : 0.55,
          color: pt.isActive ? "#fff" : "#d1d5db",
          weight: pt.isActive ? 2 : 1.5,
        }).addTo(markerLayerRef.current!);

        const typeLabel = pt.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        const statusLabel = pt.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        const statusBadgeColor = pt.isActive ? colors.stroke : "#6b7280";
        const statusTextColor = pt.isActive ? "#fff" : "#f3f4f6";

        marker.bindPopup(
          `<div style="font-size:13px;line-height:1.5;min-width:160px">
            <div style="font-weight:600;margin-bottom:4px">#${pt.ticketIdCustom || pt.ticketNumber || pt.id}</div>
            <div>${pt.title}</div>
            <div style="color:#666;font-size:11px;margin-top:2px">${pt.customerName}</div>
            <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
              <span style="background:${statusBadgeColor};color:${statusTextColor};padding:1px 8px;border-radius:10px;font-size:11px">${statusLabel}</span>
              <span style="background:#f3f4f6;color:#374151;padding:1px 8px;border-radius:10px;font-size:11px">${typeLabel}</span>
            </div>
          </div>`,
          { closeButton: false }
        );
        const shortTitle =
          pt.title.length > 10 ? `${pt.title.slice(0, 10)}…` : pt.title;
        const performanceLabel =
          pt.performStatus === "perform" ? "On Time" : "Overdue";
        const tooltipContent = `
          <div style="font-size:12px;line-height:1.3;">
            <strong>#${pt.ticketIdCustom || pt.ticketNumber || pt.id}</strong><br/>
            ${shortTitle}<br/>
            ${performanceLabel}
          </div>`;
        marker.bindTooltip(tooltipContent, {
          direction: "top",
          offset: [0, -8],
          opacity: 0.95,
          className: "map-tooltip",
        });
        marker.on("mouseover", () => marker.openTooltip());
        marker.on("mouseout", () => marker.closeTooltip());
        marker.on("click", () => {
          window.location.href = `/tickets/${pt.id}`;
        });
      });
    }

    if (technicianPoint) {
      const techMarker = L.circleMarker([technicianPoint.lat, technicianPoint.lng], {
        radius: 11,
        fillColor: "rgba(16, 185, 129, 0.35)",
        fillOpacity: 0.6,
        color: "#0ea5e9",
        weight: 2,
        dashArray: "4",
      }).addTo(map);

      const popupContent = `
        <div style="font-size:13px;line-height:1.4;min-width:180px">
          <div style="font-weight:600;margin-bottom:2px">Top Assignment</div>
          <div>#${technicianPoint.ticketIdCustom || technicianPoint.ticketNumber || technicianPoint.id}</div>
          <div>${technicianPoint.customerName}</div>
          <div style="font-size:12px;color:#475569;margin-top:2px">${technicianPoint.title}</div>
        </div>
      `;
      techMarker.bindPopup(popupContent, { closeButton: false });
      techMarkerRef.current = techMarker;
    }

    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [points, viewMode]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Problems Heatmap
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
            Problems Heatmap
          </CardTitle>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1" data-testid="map-view-toggle">
              <Button
                size="sm"
                variant={viewMode === "heatmap" ? "default" : "outline"}
                onClick={() => setViewMode("heatmap")}
                data-testid="button-heatmap-view"
              >
                Heatmap
              </Button>
              <Button
                size="sm"
                variant={viewMode === "markers" ? "default" : "outline"}
                onClick={() => setViewMode("markers")}
                data-testid="button-markers-view"
              >
                Markers
              </Button>
            </div>
            {viewMode === "markers" && (
              <div className="flex items-center gap-3 flex-wrap">
                <Legend color="#3b82f6" label="Installation" />
                <Legend color="#f59e0b" label="Home Maint." />
                <Legend color="#ef4444" label="Backbone" />
              </div>
            )}
            <span className="text-xs text-muted-foreground" data-testid="text-ticket-count">
              {points.length} / {tickets?.length || 0} mapped
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

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-block w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
