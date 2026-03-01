import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api, errorSchemas } from "@shared/routes";
import { z } from "zod";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import multer from "multer";
import {
  TicketStatus,
  UserRole,
  TicketPriority,
  TicketType,
  tickets,
  ticketAssignments,
  performanceLogs,
  technicianFees,
  type Ticket,
  type TicketAssignment,
  type User,
} from "@shared/schema";
import { hash, compare } from "bcryptjs";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
}

function extractCoordsFromUrl(url: string): { lat: number; lng: number } | null {
  if (!url) return null;
  const patterns = [
    /[?&]q=([-\d.]+),([-\d.]+)/,
    /@([-\d.]+),([-\d.]+)/,
    /place\/([-\d.]+),([-\d.]+)/,
    /ll=([-\d.]+),([-\d.]+)/,
    /center=([-\d.]+),([-\d.]+)/,
    /!3d([-\d.]+)!4d([-\d.]+)/,
    /\/([-\d.]+),([-\d.]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }
  }
  return null;
}

async function resolveShortUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000) });
    const location = res.headers.get("location");
    if (location) {
      try {
        return new URL(location, url).href;
      } catch {
        return location;
      }
    }
    return res.url || url;
  } catch {
    try {
      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(8000) });
      return res.url || url;
    } catch {
      return url;
    }
  }
}

async function extractCoordsWithResolve(url: string): Promise<{ lat: number; lng: number } | null> {
  if (!url) return null;
  let coords = extractCoordsFromUrl(url);
  if (coords) return coords;
  
  if (url.includes("goo.gl") || url.includes("maps.app") || url.includes("bit.ly") || url.includes("shorturl")) {
    const resolved = await resolveShortUrl(url);
    if (resolved !== url) {
      coords = extractCoordsFromUrl(resolved);
      if (coords) return coords;
    }
  }
  return null;
}

async function reverseGeocodeArea(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
      { headers: { "User-Agent": "NetGuard-ISP-Ticketing/1.0" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address;
    if (!addr) return null;
    return addr.village || addr.suburb || addr.neighbourhood || addr.quarter ||
           addr.city_district || addr.town || addr.city || addr.county || null;
  } catch {
    return null;
  }
}

function clampCutoffDay(value?: string | number): number {
  if (typeof value === "number") {
    return Math.max(1, Math.min(28, Math.floor(value)));
  }
  const parsed = parseInt(String(value ?? ""), 10);
  if (isNaN(parsed)) return 25;
  return Math.max(1, Math.min(28, parsed));
}

function computePerformancePeriod(reference: Date, cutoffDay: number) {
  const normalizedCutoff = clampCutoffDay(cutoffDay);
  const today = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  let end = new Date(reference.getFullYear(), reference.getMonth(), normalizedCutoff);
  if (today > end) {
    end = new Date(reference.getFullYear(), reference.getMonth() + 1, normalizedCutoff);
  }
  end.setHours(23, 59, 59, 999);

  const prevMonthLast = new Date(end.getFullYear(), end.getMonth(), 0);
  const daysInPrevMonth = prevMonthLast.getDate();
  const start = new Date(end);
  start.setDate(end.getDate() - daysInPrevMonth + 1);
  start.setHours(0, 0, 0, 0);

  return { start, end };
}

type AssigneeWithAssignment = User & {
  assignmentType: string | null;
  assignedAt: Date | string | null;
};

async function attachAssignmentsToTicket(ticket: Ticket) {
  const assignments = await storage.getTicketAssignments(ticket.id);
  const assignees = await Promise.all(assignments.map(async (assignment) => {
    const user = await storage.getUser(assignment.userId);
    if (!user) return null;
    return {
      ...user,
      assignmentType: assignment.assignmentType || null,
      assignedAt: assignment.assignedAt || null,
    };
  }));
  const assigneesWithMeta = assignees.filter((a): a is AssigneeWithAssignment => Boolean(a));

  return {
    ...ticket,
    assignee: assigneesWithMeta[0] || null,
    assignees: assigneesWithMeta,
    assignments,
    assignmentType: assignments[0]?.assignmentType || null,
    assignedAt: assignments[0]?.assignedAt || null,
  };
}

function generatePeriodDays(start: Date, end: Date) {
  const days: Array<{ iso: string; label: string }> = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push({
      iso: cursor.toISOString().slice(0, 10),
      label: `${cursor.getDate()}/${cursor.getMonth() + 1}`,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

const s3Client = new S3Client({
  region: "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  },
  forcePathStyle: true,
});

const TILE_SERVER_URL = process.env.TILE_SERVER_URL || "https://tile.openstreetmap.org";
const MAP_TILE_CACHE_CONTROL = "public, max-age=604800, stale-while-revalidate=86400";
const TILE_PREFETCH_BOUNDS = (process.env.TILE_PREFETCH_BOUNDS || "-6.5,106.4,-5.9,107.1").split(",").map((value) => parseFloat(value.trim()));
const TILE_PREFETCH_ZOOM_RANGE = process.env.TILE_PREFETCH_ZOOM_RANGE || "12-15";
const TILE_PREFETCH_LIMIT = Math.max(64, Math.min(parseInt(process.env.TILE_PREFETCH_LIMIT || "512", 10), 2048));

const execAsync = promisify(exec);

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

function parseBounds(values: number[]): { latMin: number; lngMin: number; latMax: number; lngMax: number } {
  if (values.length !== 4 || values.some((v) => Number.isNaN(v))) {
    return { latMin: -6.5, lngMin: 106.4, latMax: -5.9, lngMax: 107.1 };
  }
  const [lat1, lng1, lat2, lng2] = values;
  return {
    latMin: Math.min(lat1, lat2),
    lngMin: Math.min(lng1, lng2),
    latMax: Math.max(lat1, lat2),
    lngMax: Math.max(lng1, lng2),
  };
}

function parseZoomRange(value: string): [number, number] {
  const tokens = value.split("-").map((token) => parseInt(token.trim(), 10)).filter((num) => !Number.isNaN(num));
  if (tokens.length === 2) {
    return [Math.min(tokens[0], tokens[1]), Math.max(tokens[0], tokens[1])];
  }
  if (tokens.length === 1) {
    return [tokens[0], tokens[0]];
  }
  return [12, 15];
}

const PRELOAD_TILE_BOUNDS = parseBounds(TILE_PREFETCH_BOUNDS);
const [PRELOAD_MIN_ZOOM, PRELOAD_MAX_ZOOM] = parseZoomRange(TILE_PREFETCH_ZOOM_RANGE);

async function prefetchMapTiles() {
  const { latMin, lngMin, latMax, lngMax } = PRELOAD_TILE_BOUNDS;
  const startTime = Date.now();
  let cachedCount = 0;
  const logPrefix = "[OpenMaps]";
  try {
    console.log(`${logPrefix} prefetching tiles for [${latMin},${lngMin}] → [${latMax},${lngMax}] zoom ${PRELOAD_MIN_ZOOM}-${PRELOAD_MAX_ZOOM}`);
    outer: for (let z = PRELOAD_MIN_ZOOM; z <= PRELOAD_MAX_ZOOM; z++) {
      const northWest = latLngToTileIndex(latMax, lngMin, z);
      const southEast = latLngToTileIndex(latMin, lngMax, z);
      const minX = Math.min(northWest.x, southEast.x);
      const maxX = Math.max(northWest.x, southEast.x);
      const minY = Math.min(northWest.y, southEast.y);
      const maxY = Math.max(northWest.y, southEast.y);

      for (let x = minX; x <= maxX; x += 1) {
        for (let y = minY; y <= maxY; y += 1) {
          if (cachedCount >= TILE_PREFETCH_LIMIT) {
            break outer;
          }
          const existing = await storage.getCachedTile(z, x, y);
          if (existing) {
            continue;
          }
          const tileUrl = `${TILE_SERVER_URL}/${z}/${x}/${y}.png`;
          try {
            const tileResponse = await fetch(tileUrl, {
              headers: {
                "User-Agent": "NetGuard-OpenMaps/1.0",
                Accept: "image/png,image/webp,image/*;q=0.9,*/*;q=0.8",
              },
              signal: AbortSignal.timeout(9000),
            });
            if (!tileResponse.ok) {
              console.warn(`${logPrefix} ${tileUrl} returned ${tileResponse.status}`);
              continue;
            }
            const buffer = Buffer.from(await tileResponse.arrayBuffer());
            const contentType = tileResponse.headers.get("content-type") || "image/png";
            await storage.saveCachedTile({ z, x, y, tileData: buffer, contentType });
            cachedCount += 1;
          } catch (err) {
            console.warn(`${logPrefix} prefetch failed for ${z}/${x}/${y}`, err);
          }
        }
      }
    }
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`${logPrefix} prefetch complete, cached ${cachedCount} new tiles in ${elapsed}s`);
  } catch (err) {
    console.error(`${logPrefix} prefetch encountered an error`, err);
  }
}

const HELP_DESK_MANUAL_ASSIGNMENT_RESTRICTED_TYPES = new Set([
  TicketType.HOME_MAINTENANCE,
  TicketType.INSTALLATION,
]);

function isBackboneOrVendor(tech?: { isBackboneSpecialist?: boolean; isVendorSpecialist?: boolean }) {
  return Boolean(tech?.isBackboneSpecialist || tech?.isVendorSpecialist);
}

const uploadsDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.use('/uploads', (await import('express')).default.static(uploadsDir, {
    immutable: true,
    maxAge: "30d",
  }));

  // === AUTH ===
  app.post(api.auth.login.path, async (req, res) => {
    try {
      const { username, password } = api.auth.login.input.parse(req.body);
      const user = await storage.getUserByUsername(username);
      
      if (!user || !(await compare(password, user.password))) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      (req as any).session.userId = user.id;
      res.json(user);
    } catch (err) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.post(api.auth.logout.path, (req, res) => {
    (req as any).session.destroy();
    res.json({ message: "Logged out" });
  });

  app.get(api.auth.me.path, async (req, res) => {
    const userId = (req as any).session.userId;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    
    const user = await storage.getUser(userId);
    if (!user) return res.status(401).json({ message: "User not found" });
    
    res.json(user);
  });

  const requireAdminAccess = async (req: any, res: any): Promise<boolean> => {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ message: "Not authenticated" });
      return false;
    }

    const currentUser = await storage.getUser(userId);
    if (!currentUser || ![UserRole.SUPERADMIN, UserRole.ADMIN].includes(currentUser.role as any)) {
      res.status(403).json({ message: "Admin access required" });
      return false;
    }

    return true;
  };

  // === USERS ===
  app.get(api.users.list.path, async (req, res) => {
    const role = req.query.role as string | undefined;
    const sessionUserId = (req as any).session.userId;
    if (sessionUserId) {
      const sessionUser = await storage.getUser(sessionUserId);
      if (sessionUser?.role === UserRole.HELPDESK && (!role || role === UserRole.TECHNICIAN)) {
        const users = await storage.getAllUsers(UserRole.TECHNICIAN);
        res.json(users);
        return;
      }
    }
    if (!(await requireAdminAccess(req, res))) return;
    const users = await storage.getAllUsers(role);
    res.json(users);
  });

  app.get(api.users.get.path, async (req, res) => {
    if (!(await requireAdminAccess(req, res))) return;
    const user = await storage.getUser(Number(req.params.id));
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  });

  app.post(api.users.create.path, async (req, res) => {
    if (!(await requireAdminAccess(req, res))) return;
    try {
      const input = api.users.create.input.parse(req.body);
      const hashedPassword = await hash(input.password, 10);
      if (input.name) input.name = toTitleCase(input.name);
      const user = await storage.createUser({ ...input, password: hashedPassword });
      res.status(201).json(user);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch(api.users.update.path, async (req, res) => {
    if (!(await requireAdminAccess(req, res))) return;
    try {
      const input = api.users.update.input.parse(req.body);
      if (input.password) {
        input.password = await hash(input.password, 10);
      }
      if (input.name) input.name = toTitleCase(input.name);
      const user = await storage.updateUser(Number(req.params.id), input);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    } catch (err) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.delete(api.users.delete.path, async (req, res) => {
    if (!(await requireAdminAccess(req, res))) return;
    const user = await storage.getUser(Number(req.params.id));
    if (!user) return res.status(404).json({ message: "User not found" });
    await storage.deleteUser(Number(req.params.id));
    res.status(204).send();
  });

  // === TICKETS ===
  app.get(api.tickets.list.path, async (req, res) => {
    try {
      const userId = (req as any).session.userId;
      const user = userId ? await storage.getUser(userId) : undefined;

      if (user?.role === UserRole.TECHNICIAN) {
         const myTickets = await storage.getTicketsByAssignee(user.id);
         const withAssignees = await Promise.all(myTickets.map((ticket) => attachAssignmentsToTicket(ticket)));
         return res.json(withAssignees);
      }

      const tickets = await storage.getAllTickets(req.query);
      
      const ticketsWithAssignee = await Promise.all(tickets.map((ticket) => attachAssignmentsToTicket(ticket)));

      res.json(ticketsWithAssignee);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.tickets.get.path, async (req, res) => {
    const ticket = await storage.getTicket(Number(req.params.id));
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    
    const enriched = await attachAssignmentsToTicket(ticket);
    const assignment = enriched.assignments?.[0] || null;
    res.json({ ...enriched, assignment });
  });

  app.post(api.tickets.create.path, async (req, res) => {
    try {
      const input = req.body;
      
      if (input.customerName) input.customerName = toTitleCase(input.customerName);

      const now = new Date();
      let slaHours = 24;
      if (input.type === TicketType.INSTALLATION) slaHours = 72;
      const slaDeadline = new Date(now.getTime() + slaHours * 60 * 60 * 1000);

      const ticketNumber = `INC-${Date.now().toString().slice(-6)}`;

      const ticketFeeSetting = await storage.getSetting(`ticket_fee_${input.type}`);
      const transportFeeSetting = await storage.getSetting(`transport_fee_${input.type}`);
      const ticketFee = ticketFeeSetting?.value || "0";
      const transportFee = transportFeeSetting?.value || "0";
      const bonus = (parseFloat(ticketFee) + parseFloat(transportFee)).toFixed(2);

      let area: string | null = null;
      const locationUrl = input.customerLocationUrl || "";
      const coords = await extractCoordsWithResolve(locationUrl);
      if (coords) {
        area = await reverseGeocodeArea(coords.lat, coords.lng);
      }

      const ticket = await storage.createTicket({
        ...input,
        ticketNumber,
        slaDeadline,
        status: TicketStatus.OPEN,
        customerLocationUrl: locationUrl,
        area,
        bonus,
        ticketFee,
        transportFee,
        latitude: coords ? String(coords.lat) : null,
        longitude: coords ? String(coords.lng) : null,
      });

      res.status(201).json(ticket);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error("Create ticket error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch(api.tickets.update.path, async (req, res) => {
    try {
      const input = api.tickets.update.input.parse(req.body);
      if (input.customerName) input.customerName = toTitleCase(input.customerName);

      if (input.type) {
        const existingTicket = await storage.getTicket(Number(req.params.id));
        if (existingTicket && input.type !== existingTicket.type && existingTicket.status !== TicketStatus.CLOSED && existingTicket.status !== TicketStatus.REJECTED) {
          const ticketFeeSetting = await storage.getSetting(`ticket_fee_${input.type}`);
          const transportFeeSetting = await storage.getSetting(`transport_fee_${input.type}`);
          const ticketFee = ticketFeeSetting?.value || "0";
          const transportFee = transportFeeSetting?.value || "0";
          const bonus = (parseFloat(ticketFee) + parseFloat(transportFee)).toFixed(2);
          (input as any).ticketFee = ticketFee;
          (input as any).transportFee = transportFee;
          (input as any).bonus = bonus;

          let slaHours = 24;
          if (input.type === TicketType.INSTALLATION) slaHours = 72;
          const slaDeadline = new Date(existingTicket.createdAt.getTime() + slaHours * 60 * 60 * 1000);
          (input as any).slaDeadline = slaDeadline;
        }
      }

      const ticket = await storage.updateTicket(Number(req.params.id), input);
      res.json(ticket);
    } catch (err) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.delete(api.tickets.delete.path, async (req, res) => {
    const ticket = await storage.getTicket(Number(req.params.id));
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    await storage.deleteTicket(Number(req.params.id));
    res.status(204).send();
  });

  app.post(api.tickets.assign.path, async (req, res) => {
    const ticketId = Number(req.params.id);
    const { userId, assignedAt } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "User ID required for manual assignment" });
    }

    try {
      const sessionUserId = (req as any).session.userId;
      const sessionUser = sessionUserId ? await storage.getUser(sessionUserId) : null;
      if (!sessionUser || ![UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.HELPDESK].includes(sessionUser.role as any)) {
        return res.status(403).json({ message: "Only superadmin, admin, or helpdesk can manually assign tickets" });
      }
      const ticket = await storage.getTicket(ticketId);
      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const targetTech = await storage.getUser(userId);
      if (!targetTech || targetTech.role !== UserRole.TECHNICIAN) {
        return res.status(400).json({ message: "Target user is not a valid technician" });
      }

      const existingAssignees = await storage.getAssigneesForTicket(ticketId);
      const isHelpdesk = sessionUser?.role === UserRole.HELPDESK;
      const isRestrictedType = HELP_DESK_MANUAL_ASSIGNMENT_RESTRICTED_TYPES.has(ticket.type as TicketType);
      const isInitialAssignment = existingAssignees.length === 0;
      if (isHelpdesk && isRestrictedType && isInitialAssignment && !isBackboneOrVendor(targetTech)) {
        return res.status(403).json({
          message:
            "Helpdesk can only manually assign backbone or vendor specialists to home installation and maintenance tickets. Other technicians should use auto-assign (Get Ticket).",
        });
      }
      if (existingAssignees.some((a: any) => a.userId === userId || a.id === userId)) {
        return res.status(400).json({ message: "This technician is already assigned to this ticket" });
      }

      const assignedTimestamp = assignedAt ? new Date(assignedAt) : new Date();
      await storage.assignTicket(ticketId, userId, "manual", assignedTimestamp);
      await storage.updateTicket(ticketId, { status: TicketStatus.ASSIGNED });
      const updatedTicket = await storage.getTicket(ticketId);
      const assignees = await storage.getAssigneesForTicket(ticketId);
      res.json({ ...updatedTicket, assignee: assignees[0], assignees });
    } catch (err: any) {
      if (err.message === "Maximum 2 assignees per ticket") {
        return res.status(400).json({ message: err.message });
      }
      throw err;
    }
  });

  // === REASSIGN TICKET ===
  app.post("/api/tickets/:id/reassign", async (req, res) => {
    try {
      const ticketId = Number(req.params.id);
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || ![UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.HELPDESK].includes(user.role as any)) {
        return res.status(403).json({ message: "Only superadmin, admin, or helpdesk can reassign tickets" });
      }

      const ticket = await storage.getTicket(ticketId);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (['closed', 'rejected'].includes(ticket.status)) {
        return res.status(400).json({ message: "Cannot reassign a closed or rejected ticket" });
      }

    const { technicianIds, assignedAt } = req.body;
      if (!technicianIds || !Array.isArray(technicianIds) || technicianIds.length === 0 || technicianIds.length > 2) {
        return res.status(400).json({ message: "Provide 1 or 2 technician IDs" });
      }

      const existingAssignees = await storage.getAssigneesForTicket(ticketId);
      const currentLeadId = existingAssignees[0]?.id;

      if (user.role === UserRole.HELPDESK) {
        if (!currentLeadId) {
          return res.status(400).json({ message: "Helpdesk can only reassign tickets that already have a lead technician" });
        }

        if (Number(technicianIds[0]) !== Number(currentLeadId)) {
          return res.status(403).json({ message: "Helpdesk can only change partner technician. Lead technician is locked." });
        }

        for (const techId of technicianIds.slice(1)) {
          const tech = await storage.getUser(Number(techId));
          if (tech && !tech.isBackboneSpecialist && !tech.isVendorSpecialist) {
            return res.status(403).json({ message: "Helpdesk can only assign partner to backbone or vendor specialists." });
          }
        }
      }

      await storage.removeAllAssignments(ticketId);

      const assignedTimestamp = assignedAt ? new Date(assignedAt) : new Date();
      for (const techId of technicianIds) {
        await storage.assignTicket(ticketId, Number(techId), "manual", assignedTimestamp);
      }

      let newStatus = ticket.status;
      if (ticket.status === 'open' || ticket.status === 'waiting_assignment') {
        newStatus = TicketStatus.ASSIGNED;
      }
      if (ticket.status === 'in_progress') {
        newStatus = TicketStatus.ASSIGNED;
      }
      await storage.updateTicket(ticketId, { status: newStatus });

      const updated = await storage.getTicket(ticketId);
      const assignees = await storage.getAssigneesForTicket(ticketId);
      res.json({ ...updated, assignee: assignees[0], assignees });
    } catch (err: any) {
      console.error("Reassign error:", err);
      res.status(500).json({ message: err.message || "Failed to reassign ticket" });
    }
  });

  // === UNASSIGN TICKET (remove all assignments, set back to open) ===
  app.post("/api/tickets/:id/unassign", async (req, res) => {
    try {
      const ticketId = Number(req.params.id);
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || ![UserRole.SUPERADMIN, UserRole.ADMIN].includes(user.role as any)) {
        return res.status(403).json({ message: "Only superadmin or admin can unassign tickets" });
      }

      const ticket = await storage.getTicket(ticketId);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (['closed', 'rejected'].includes(ticket.status)) {
        return res.status(400).json({ message: "Cannot unassign a closed or rejected ticket" });
      }

      await storage.removeAllAssignments(ticketId);
      await storage.updateTicket(ticketId, { status: TicketStatus.OPEN });

      const updated = await storage.getTicket(ticketId);
      res.json({ ...updated, assignee: null, assignees: [] });
    } catch (err: any) {
      console.error("Unassign error:", err);
      res.status(500).json({ message: err.message || "Failed to unassign ticket" });
    }
  });

  app.get("/api/map-tiles/:z/:x/:y", async (req, res) => {
    const z = Number(req.params.z);
    const x = Number(req.params.x);
    const y = Number(req.params.y);
    if ([z, x, y].some((n) => Number.isNaN(n))) {
      return res.status(400).json({ message: "Invalid tile coordinates" });
    }

    try {
      const cached = await storage.getCachedTile(z, x, y);
      if (cached) {
        res.setHeader("Cache-Control", MAP_TILE_CACHE_CONTROL);
        return res.type(cached.contentType).send(cached.tileData);
      }

      const tileUrl = `${TILE_SERVER_URL}/${z}/${x}/${y}.png`;
      const tileRes = await fetch(tileUrl, {
        headers: {
          "User-Agent": "NetGuard-OpenMaps/1.0",
          Accept: "image/png,image/webp,image/*;q=0.9,*/*;q=0.8",
        },
      });

      if (!tileRes.ok) {
        const body = await tileRes.text().catch(() => "");
        return res.status(tileRes.status).send(body);
      }

      const buffer = Buffer.from(await tileRes.arrayBuffer());
      const contentType = tileRes.headers.get("content-type") || "image/png";
      await storage.saveCachedTile({ z, x, y, tileData: buffer, contentType });
      res.setHeader("Cache-Control", MAP_TILE_CACHE_CONTROL);
      res.type(contentType).send(buffer);
    } catch (err) {
      console.error("Map tile error:", err);
      res.status(500).json({ message: "Failed to load map tile" });
      }
    });

  void prefetchMapTiles();

  // === FREE TECHNICIANS (no active/in-progress tickets) ===
  app.get("/api/technicians/free", async (req, res) => {
    try {
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const excludeId = req.query.excludeUserId ? Number(req.query.excludeUserId) : undefined;
      const freeTechs = await storage.getFreeTechnicians(excludeId);
      const safe = freeTechs.map(({ password, ...rest }) => rest);
      res.json(safe);
    } catch (err) {
      console.error("Free technicians error:", err);
      res.status(500).json({ message: "Failed to fetch free technicians" });
    }
  });

  // === AUTO-ASSIGN (Technician presses "Get Ticket") ===
  // Smart assignment with 4:2 maintenance:installation ratio
  // Priority: 1) Nearest location from last same-day job, 2) Highest priority, 3) Random among same priority
  // Fallback: If no preferred type available, try the other type
  app.post(api.tickets.autoAssign.path, async (req, res) => {
    try {
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const user = await storage.getUser(userId);
      if (!user || user.role !== UserRole.TECHNICIAN) {
        return res.status(403).json({ message: "Only technicians can use auto-assign" });
      }

      const activeTicket = await storage.getActiveTicketForUser(userId);
      if (activeTicket) {
        return res.status(400).json({ message: "You already have an active ticket. Complete it first." });
      }

      const { partnerId } = req.body || {};
      if (!partnerId) {
        return res.status(400).json({ message: "Please select a partner before getting a ticket" });
      }

      const partner = await storage.getUser(partnerId);
      if (!partner || partner.role !== UserRole.TECHNICIAN) {
        return res.status(400).json({ message: "Selected partner is not a valid technician" });
      }

      const partnerActive = await storage.getActiveTicketForUser(partnerId);
      if (partnerActive) {
        return res.status(400).json({ message: "Selected partner already has an active ticket" });
      }

      let preferredType: "maintenance" | "installation" = "maintenance";
      let maintenancePhase = true;
      const ratioMaintSetting = await storage.getSetting("preference_ratio_maintenance");
      const ratioInstallSetting = await storage.getSetting("preference_ratio_installation");
      const ratioMaint = parseInt(ratioMaintSetting?.value || "4", 10) || 4;
      const ratioInstall = parseInt(ratioInstallSetting?.value || "2", 10) || 2;
      const cycleSize = ratioMaint + ratioInstall;

      const counts = await storage.getCompletedTicketsTodayByUser(userId);
      const totalDone = counts.maintenanceCount + counts.installationCount;
      const cyclePosition = cycleSize > 0 ? totalDone % cycleSize : 0;
      maintenancePhase = cyclePosition < ratioMaint;
      preferredType = maintenancePhase ? "maintenance" : "installation";

      // Get last completed ticket today for location proximity
      const lastTicket = await storage.getLastCompletedTicketToday(userId);
      const lastLocation = lastTicket?.customerLocationUrl || null;

      const enforceHomeMaintenance = !user.isBackboneSpecialist && !user.isVendorSpecialist;
      const ticket = await storage.getSmartOpenTicket({
        isBackboneSpecialist: user.isBackboneSpecialist ?? false,
        preferredType,
        lastTicketLocation: lastLocation,
        enforceHomeMaintenanceStrategy: enforceHomeMaintenance,
        maintenancePhase,
      });

      if (!ticket) {
        return res.status(404).json({ message: "No open tickets available" });
      }

      await storage.assignTicketWithPartner(ticket.id, userId, partnerId, "auto");
      const updated = await storage.updateTicket(ticket.id, { status: TicketStatus.ASSIGNED });

      res.json(updated);
    } catch (err) {
      console.error("Auto-assign error:", err);
      res.status(500).json({ message: "Failed to auto-assign ticket" });
    }
  });

  app.post(api.tickets.start.path, async (req, res) => {
    const ticket = await storage.updateTicket(Number(req.params.id), { status: TicketStatus.IN_PROGRESS });
    res.json(ticket);
  });

  app.post(api.tickets.close.path, async (req, res) => {
    const input = req.body;
    const ticketId = Number(req.params.id);
    const existingTicket = await storage.getTicket(ticketId);

    if (!existingTicket) return res.status(404).json({ message: "Ticket not found" });

    const now = new Date();
    const durationMinutes = Math.floor((now.getTime() - existingTicket.createdAt.getTime()) / 60000);
    const isWithinSLA = existingTicket.slaDeadline > now;

    const globalTicketFeeSetting = await storage.getSetting(`ticket_fee_${existingTicket.type}`);
    const globalTransportFeeSetting = await storage.getSetting(`transport_fee_${existingTicket.type}`);
    const globalTicketFee = globalTicketFeeSetting?.value || "0";
    const globalTransportFee = globalTransportFeeSetting?.value || "0";

    const ticket = await storage.updateTicket(ticketId, {
      status: TicketStatus.CLOSED,
      closedAt: now,
      durationMinutes,
      performStatus: isWithinSLA ? "perform" : "not_perform",
      ticketFee: globalTicketFee,
      transportFee: globalTransportFee,
      bonus: (parseFloat(globalTicketFee) + parseFloat(globalTransportFee)).toFixed(2),
      ...input
    });

    const allAssignees = await storage.getAssigneesForTicket(ticketId);
    for (const assignee of allAssignees) {
      const techFee = await storage.getTechnicianFeeForType(assignee.id, existingTicket.type);
      const techTicketFee = techFee ? techFee.ticketFee : globalTicketFee;
      const techTransportFee = techFee ? techFee.transportFee : globalTransportFee;
      const finalTicketFee = isWithinSLA ? techTicketFee : "0";
      const finalTransportFee = techTransportFee || "0";
      const techBonus = (parseFloat(finalTicketFee || "0") + parseFloat(finalTransportFee || "0")).toFixed(2);

      await storage.logPerformance({
        userId: assignee.id,
        ticketId: ticket.id,
        result: ticket.performStatus as "perform" | "not_perform",
        completedWithinSLA: ticket.performStatus === "perform",
        durationMinutes,
        ticketFee: finalTicketFee,
        transportFee: finalTransportFee,
        bonus: techBonus,
      });
    }

    res.json(ticket);
  });

  // === NO RESPONSE (Technician reports customer no response) ===
  app.post(api.tickets.noResponse.path, async (req, res) => {
    try {
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const user = await storage.getUser(userId);
      if (!user || user.role !== UserRole.TECHNICIAN) {
        return res.status(403).json({ message: "Only technicians can report no response" });
      }

      const ticketId = Number(req.params.id);
      const existingTicket = await storage.getTicket(ticketId);
      if (!existingTicket) return res.status(404).json({ message: "Ticket not found" });

      if (!['assigned', 'in_progress'].includes(existingTicket.status)) {
        return res.status(400).json({ message: "Ticket must be assigned or in progress" });
      }

      const { rejectionReason } = req.body;
      if (!rejectionReason || rejectionReason.trim() === "") {
        return res.status(400).json({ message: "Reason is required" });
      }

      const ticket = await storage.updateTicket(ticketId, {
        status: TicketStatus.PENDING_REJECTION,
        rejectionReason: rejectionReason.trim(),
      });

      res.json(ticket);
    } catch (err) {
      console.error("No response error:", err);
      res.status(500).json({ message: "Failed to update ticket" });
    }
  });

  // === REJECT (Admin/Helpdesk confirms rejection with reason) ===
  app.post(api.tickets.reject.path, async (req, res) => {
    try {
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const user = await storage.getUser(userId);
      if (!user || ![UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.HELPDESK].includes(user.role as any)) {
        return res.status(403).json({ message: "Only admin, superadmin or helpdesk can confirm rejection" });
      }

      const { reason } = req.body;
      if (!reason || reason.trim() === "") {
        return res.status(400).json({ message: "Reason is required" });
      }

      const ticketId = Number(req.params.id);
      const existingTicket = await storage.getTicket(ticketId);
      if (!existingTicket) return res.status(404).json({ message: "Ticket not found" });

      if (existingTicket.status !== TicketStatus.PENDING_REJECTION) {
        return res.status(400).json({ message: "Ticket must be pending rejection" });
      }

      const now = new Date();
      const durationMinutes = Math.floor((now.getTime() - existingTicket.createdAt.getTime()) / 60000);

      const ticket = await storage.updateTicket(ticketId, {
        status: TicketStatus.REJECTED,
        closedAt: now,
        durationMinutes,
        performStatus: "not_perform",
        bonus: "0",
        ticketFee: "0",
        transportFee: "0",
        rejectionReason: `${existingTicket.rejectionReason || ""}\n[Confirmed] ${reason.trim()}`.trim(),
      });

      res.json(ticket);
    } catch (err) {
      console.error("Reject error:", err);
      res.status(500).json({ message: "Failed to reject ticket" });
    }
  });

  // === CANCEL REJECT (Admin/Helpdesk reopens ticket to assigned) ===
  app.post(api.tickets.cancelReject.path, async (req, res) => {
    try {
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const user = await storage.getUser(userId);
      if (!user || ![UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.HELPDESK].includes(user.role as any)) {
        return res.status(403).json({ message: "Only admin, superadmin or helpdesk can cancel rejection" });
      }

      const ticketId = Number(req.params.id);
      const existingTicket = await storage.getTicket(ticketId);
      if (!existingTicket) return res.status(404).json({ message: "Ticket not found" });

      if (existingTicket.status !== TicketStatus.PENDING_REJECTION) {
        return res.status(400).json({ message: "Ticket must be pending rejection" });
      }

      const ticket = await storage.updateTicket(ticketId, {
        status: TicketStatus.ASSIGNED,
        rejectionReason: null,
      });

      res.json(ticket);
    } catch (err) {
      console.error("Cancel reject error:", err);
      res.status(500).json({ message: "Failed to cancel rejection" });
    }
  });

  // === CLOSE BY HELPDESK (Admin/Helpdesk closes pending_rejection ticket with reason) ===
  app.post(api.tickets.closeByHelpdesk.path, async (req, res) => {
    try {
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const user = await storage.getUser(userId);
      if (!user || ![UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.HELPDESK].includes(user.role as any)) {
        return res.status(403).json({ message: "Only admin, superadmin or helpdesk can close this ticket" });
      }

      const { reason } = req.body;
      if (!reason || reason.trim() === "") {
        return res.status(400).json({ message: "Reason is required" });
      }

      const ticketId = Number(req.params.id);
      const existingTicket = await storage.getTicket(ticketId);
      if (!existingTicket) return res.status(404).json({ message: "Ticket not found" });

      if (existingTicket.status !== TicketStatus.PENDING_REJECTION) {
        return res.status(400).json({ message: "Ticket must be pending rejection" });
      }

      const now = new Date();
      const durationMinutes = Math.floor((now.getTime() - existingTicket.createdAt.getTime()) / 60000);
      const isWithinSLA = existingTicket.slaDeadline > now;

      const closeFee = isWithinSLA ? existingTicket.ticketFee : "0";
      const closeTransport = existingTicket.transportFee || "0";
      const closeBonus = (parseFloat(closeFee || "0") + parseFloat(closeTransport || "0")).toFixed(2);

      const ticket = await storage.updateTicket(ticketId, {
        status: TicketStatus.CLOSED,
        closedAt: now,
        durationMinutes,
        performStatus: isWithinSLA ? "perform" : "not_perform",
        bonus: closeBonus,
        ticketFee: closeFee,
        transportFee: closeTransport,
        rejectionReason: `${existingTicket.rejectionReason || ""}\n[Closed by helpdesk] ${reason.trim()}`.trim(),
      });

      const allAssignees = await storage.getAssigneesForTicket(ticketId);
      for (const assignee of allAssignees) {
        await storage.logPerformance({
          userId: assignee.id,
          ticketId: ticket.id,
          result: ticket.performStatus as "perform" | "not_perform",
          completedWithinSLA: ticket.performStatus === "perform",
          durationMinutes,
        });
      }

      res.json(ticket);
    } catch (err) {
      console.error("Close by helpdesk error:", err);
      res.status(500).json({ message: "Failed to close ticket" });
    }
  });

  // === REOPEN TICKET (Admin/Helpdesk/Superadmin reopens a closed ticket and reassigns) ===
  app.post(api.tickets.reopen.path, async (req, res) => {
    try {
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const user = await storage.getUser(userId);
      if (!user || ![UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.HELPDESK].includes(user.role as any)) {
        return res.status(403).json({ message: "Only admin, superadmin or helpdesk can reopen tickets" });
      }

      const ticketId = Number(req.params.id);
      const existingTicket = await storage.getTicket(ticketId);
      if (!existingTicket) return res.status(404).json({ message: "Ticket not found" });

      if (existingTicket.status !== TicketStatus.CLOSED) {
        return res.status(400).json({ message: "Only closed tickets can be reopened" });
      }

      const { reason, technicianIds } = req.body;
      if (!reason || reason.trim() === "") {
        return res.status(400).json({ message: "Reason for reopening is required" });
      }
      if (!technicianIds || !Array.isArray(technicianIds) || technicianIds.length === 0 || technicianIds.length > 2) {
        return res.status(400).json({ message: "Provide 1 or 2 technician IDs" });
      }

      // Delete performance logs from the previous close (removes bonus/credit)
      await storage.deletePerformanceLogsForTicket(ticketId);

      // Reassign to the specified technicians
      await storage.removeAllAssignments(ticketId);
      for (const techId of technicianIds) {
        await storage.assignTicket(ticketId, Number(techId), "manual");
      }

      const now = new Date();

      // Keep original SLA deadline — if already overdue, it stays overdue
      const ticket = await storage.updateTicket(ticketId, {
        status: TicketStatus.ASSIGNED,
        closedAt: null,
        durationMinutes: null,
        performStatus: null,
        bonus: "0",
        ticketFee: "0",
        transportFee: "0",
        actionDescription: null,
        speedtestResult: null,
        speedtestImageUrl: null,
        proofImageUrl: null,
        proofImageUrls: [],
        closedNote: null,
        reopenReason: `${existingTicket.reopenReason ? existingTicket.reopenReason + "\n" : ""}[Reopened ${now.toISOString().slice(0,16).replace('T',' ')}] ${reason.trim()}`,
      });

      const assignees = await storage.getAssigneesForTicket(ticketId);
      res.json({ ...ticket, assignee: assignees[0], assignees });
    } catch (err: any) {
      console.error("Reopen error:", err);
      res.status(500).json({ message: err.message || "Failed to reopen ticket" });
    }
  });

  // === REOPEN REJECTED TICKET (Admin/Helpdesk/Superadmin reopens a rejected ticket, keeps same team) ===
  app.post(api.tickets.reopenRejected.path, async (req, res) => {
    try {
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const user = await storage.getUser(userId);
      if (!user || ![UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.HELPDESK].includes(user.role as any)) {
        return res.status(403).json({ message: "Only admin, superadmin or helpdesk can reopen rejected tickets" });
      }

      const ticketId = Number(req.params.id);
      const existingTicket = await storage.getTicket(ticketId);
      if (!existingTicket) return res.status(404).json({ message: "Ticket not found" });

      if (existingTicket.status !== TicketStatus.REJECTED) {
        return res.status(400).json({ message: "Only rejected tickets can be reopened with this action" });
      }

      const { reason, assignmentMode = "current" } = req.body;
      if (!reason || reason.trim() === "") {
        return res.status(400).json({ message: "Reason for reopening is required" });
      }

      if (!["current", "auto"].includes(assignmentMode)) {
        return res.status(400).json({ message: "Invalid assignmentMode. Use 'current' or 'auto'." });
      }

      const now = new Date();
      const modeLabel = assignmentMode === "auto" ? "AUTO_OPEN" : "CURRENT_ASSIGNMENT";

      if (assignmentMode === "auto") {
        await storage.removeAllAssignments(ticketId);
      }

      const ticket = await storage.updateTicket(ticketId, {
        status: assignmentMode === "auto" ? TicketStatus.OPEN : TicketStatus.ASSIGNED,
        rejectionReason: null,
        reopenReason: `${existingTicket.reopenReason ? existingTicket.reopenReason + "\n" : ""}[Reopened from rejected ${now.toISOString().slice(0,16).replace('T',' ')} | ${modeLabel}] ${reason.trim()}`,
      });

      const assignees = await storage.getAssigneesForTicket(ticketId);
      res.json({ ...ticket, assignee: assignees[0], assignees, assignmentMode });
    } catch (err: any) {
      console.error("Reopen rejected error:", err);
      res.status(500).json({ message: err.message || "Failed to reopen rejected ticket" });
    }
  });

  // === BACKFILL AREAS (admin trigger) ===
  app.post("/api/tickets/backfill-areas", async (req, res) => {
    try {
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || !["superadmin", "admin"].includes(user.role)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const allTickets = await storage.getAllTickets({});
      const ticketsWithoutArea = allTickets.filter((t: any) => !t.area && t.customerLocationUrl);
      if (ticketsWithoutArea.length === 0) {
        return res.json({ message: "No tickets need area backfill", processed: 0 });
      }

      let processed = 0;
      const errors: string[] = [];
      for (const ticket of ticketsWithoutArea) {
        try {
          const coords = await extractCoordsWithResolve(ticket.customerLocationUrl);
          if (coords) {
            const area = await reverseGeocodeArea(coords.lat, coords.lng);
            if (area) {
              await storage.updateTicket(ticket.id, { area });
              processed++;
            } else {
              errors.push(`Ticket ${ticket.id}: geocode returned null for ${coords.lat},${coords.lng}`);
            }
          } else {
            errors.push(`Ticket ${ticket.id}: no coords found in URL: ${ticket.customerLocationUrl}`);
          }
        } catch (e: any) {
          errors.push(`Ticket ${ticket.id}: ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 1100));
      }

      res.json({ message: `Area backfill complete`, processed, total: ticketsWithoutArea.length, errors: errors.length > 0 ? errors : undefined });
    } catch (err) {
      console.error("Backfill areas error:", err);
      res.status(500).json({ message: "Failed to backfill areas" });
    }
  });

  // === BACKFILL COORDINATES (resolve short URLs and store lat/lng) ===
  app.post("/api/tickets/backfill-coordinates", async (req, res) => {
    try {
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || !["superadmin", "admin"].includes(user.role)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const allTickets = await storage.getAllTickets({});
      const ticketsWithoutCoords = allTickets.filter((t: any) => (!t.latitude || !t.longitude) && t.customerLocationUrl);
      if (ticketsWithoutCoords.length === 0) {
        return res.json({ message: "All tickets already have coordinates", processed: 0, total: 0 });
      }

      let processed = 0;
      let failed = 0;
      for (const ticket of ticketsWithoutCoords) {
        try {
          const coords = await extractCoordsWithResolve(ticket.customerLocationUrl);
          if (coords) {
            await storage.updateTicket(ticket.id, {
              latitude: String(coords.lat),
              longitude: String(coords.lng),
            });
            processed++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
        await new Promise(r => setTimeout(r, 300));
      }

      res.json({ message: "Coordinate backfill complete", processed, failed, total: ticketsWithoutCoords.length });
    } catch (err) {
      console.error("Backfill coordinates error:", err);
      res.status(500).json({ message: "Failed to backfill coordinates" });
    }
  });

  // === BACKFILL NAMES (admin trigger) ===
  app.post("/api/backfill-names", async (req, res) => {
    try {
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || !["superadmin", "admin"].includes(user.role)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { db } = await import("./db");
      const { sql: dsql } = await import("drizzle-orm");
      const userResult = await db.execute(dsql`UPDATE users SET name = INITCAP(name) WHERE name != INITCAP(name)`);
      const ticketResult = await db.execute(dsql`UPDATE tickets SET customer_name = INITCAP(customer_name) WHERE customer_name != INITCAP(customer_name)`);

      res.json({
        message: "Name formatting complete",
        usersUpdated: userResult.rowCount || 0,
        ticketsUpdated: ticketResult.rowCount || 0,
      });
    } catch (err) {
      console.error("Backfill names error:", err);
      res.status(500).json({ message: "Failed to format names" });
    }
  });

  // === RECALCULATE BONUSES (admin trigger) ===
  app.post("/api/recalculate-bonuses", async (req, res) => {
    try {
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || !["superadmin", "admin"].includes(user.role)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const globalFeeMap: Record<string, { ticketFee: string; transportFee: string }> = {
        home_maintenance: {
          ticketFee: (await storage.getSetting("ticket_fee_home_maintenance"))?.value || "0",
          transportFee: (await storage.getSetting("transport_fee_home_maintenance"))?.value || "0",
        },
        backbone_maintenance: {
          ticketFee: (await storage.getSetting("ticket_fee_backbone_maintenance"))?.value || "0",
          transportFee: (await storage.getSetting("transport_fee_backbone_maintenance"))?.value || "0",
        },
        installation: {
          ticketFee: (await storage.getSetting("ticket_fee_installation"))?.value || "0",
          transportFee: (await storage.getSetting("transport_fee_installation"))?.value || "0",
        },
      };

      const closedTicketsReport = await storage.getTicketsReport({ status: "closed" });
      const closedTickets = closedTicketsReport.tickets;
      let updatedCount = 0;
      let perfUpdatedCount = 0;

      for (const ticket of closedTickets) {
        const globalFees = globalFeeMap[ticket.type];
        if (!globalFees) continue;

        const isWithinSLA = ticket.performStatus === "perform";

        await storage.updateTicket(ticket.id, {
          ticketFee: globalFees.ticketFee,
          transportFee: globalFees.transportFee,
          bonus: (parseFloat(globalFees.ticketFee) + parseFloat(globalFees.transportFee)).toFixed(2),
        });
        updatedCount++;

        const assignees = await storage.getAssigneesForTicket(ticket.id);
        const { db } = await import("./db");
        const { performanceLogs } = await import("@shared/schema");
        const { eq: eqFn } = await import("drizzle-orm");
        await db.delete(performanceLogs).where(eqFn(performanceLogs.ticketId, ticket.id));

        const durationMinutes = ticket.closedAt && ticket.createdAt
          ? Math.floor((new Date(ticket.closedAt).getTime() - new Date(ticket.createdAt).getTime()) / 60000)
          : 0;

        for (const assignee of assignees) {
          const techFee = await storage.getTechnicianFeeForType(assignee.id, ticket.type);
          const techTicketFee = techFee ? techFee.ticketFee : globalFees.ticketFee;
          const techTransportFee = techFee ? techFee.transportFee : globalFees.transportFee;
          const finalTicketFee = isWithinSLA ? techTicketFee : "0";
          const finalTransportFee = techTransportFee || "0";
          const techBonus = (parseFloat(finalTicketFee || "0") + parseFloat(finalTransportFee || "0")).toFixed(2);

          await storage.logPerformance({
            userId: assignee.id,
            ticketId: ticket.id,
            result: isWithinSLA ? "perform" : "not_perform",
            completedWithinSLA: isWithinSLA,
            durationMinutes,
            ticketFee: finalTicketFee,
            transportFee: finalTransportFee,
            bonus: techBonus,
          });
          perfUpdatedCount++;
        }
      }

      res.json({
        message: "Recalculation complete",
        ticketsUpdated: updatedCount,
        performanceLogsUpdated: perfUpdatedCount,
      });
    } catch (err) {
      console.error("Recalculate bonuses error:", err);
      res.status(500).json({ message: "Failed to recalculate bonuses" });
    }
  });

  // === DASHBOARD ===
  app.get(api.dashboard.stats.path, async (req, res) => {
    const stats = await storage.getDashboardStats();
    res.json(stats);
  });

  // === TECHNICIAN PERFORMANCE ===
  app.get(api.performance.me.path, async (req, res) => {
    const userId = (req as any).session.userId;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const performance = await storage.getTechnicianPerformance(userId);
    res.json(performance);
  });

  // === SETTINGS ===
  app.get(api.settings.get.path, async (req, res) => {
    const key = req.params.key;
    const setting = await storage.getSetting(key);
    res.json(setting || { key, value: null });
  });

  app.get(api.settings.list.path, async (req, res) => {
    const allSettings = await storage.getAllSettings();
    res.json(allSettings);
  });

  app.put(api.settings.set.path, async (req, res) => {
    const userId = (req as any).session.userId;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const user = await storage.getUser(userId);
    if (!user || (user.role !== UserRole.SUPERADMIN && user.role !== UserRole.ADMIN)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { key, value } = req.body;
    const setting = await storage.setSetting(key, value);
    res.json(setting);
  });

  app.get("/api/system/time", async (req, res) => {
    try {
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const dbTime = await storage.getDatabaseTime();
      const serverTime = new Date();
      const serverTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      let dockerTime: string | null = null;
      let dockerTimeUtc: string | null = null;
      try {
        const result = await execAsync('date "+%Y-%m-%d %H:%M:%S %Z"');
        dockerTime = result.stdout.trim();
      } catch {
        // ignore
      }
      try {
        const result = await execAsync('date -u "+%Y-%m-%d %H:%M:%S %Z"');
        dockerTimeUtc = result.stdout.trim();
      } catch {
        // ignore
      }

      res.json({
        serverTime: serverTime.toISOString(),
        serverTimezone,
        dockerTime,
        dockerTimeUtc,
        dbTime: dbTime.now,
        dbTimezone: dbTime.timezone,
      });
    } catch (err) {
      console.error("System time error:", err);
      res.status(500).json({ message: "Failed to read system times" });
    }
  });

  // === TECHNICIAN FEES (per-technician bonus config) ===
  app.get("/api/technician-fees/:technicianId", async (req, res) => {
    try {
      const technicianId = Number(req.params.technicianId);
      const fees = await storage.getTechnicianFees(technicianId);
      res.json(fees);
    } catch (err) {
      res.status(500).json({ message: "Failed to get technician fees" });
    }
  });

  app.get("/api/technician-fees", async (req, res) => {
    try {
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const fees = await storage.getAllTechnicianFees();
      res.json(fees);
    } catch (err) {
      res.status(500).json({ message: "Failed to get all technician fees" });
    }
  });

  app.put("/api/technician-fees/:technicianId", async (req, res) => {
    try {
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== UserRole.SUPERADMIN && user.role !== UserRole.ADMIN)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const technicianId = Number(req.params.technicianId);
      const { fees } = req.body;
      if (!Array.isArray(fees)) return res.status(400).json({ message: "fees array required" });

      const results = [];
      for (const f of fees) {
        const result = await storage.setTechnicianFee(
          technicianId,
          f.ticketType,
          String(f.ticketFee || "0"),
          String(f.transportFee || "0")
        );
        results.push(result);
      }
      res.json(results);
    } catch (err) {
      console.error("Set technician fees error:", err);
      res.status(500).json({ message: "Failed to set technician fees" });
    }
  });

  // === EXPORT DATABASE (gzip compressed) ===
  app.get("/api/export-database", async (req, res) => {
    try {
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== UserRole.SUPERADMIN && user.role !== UserRole.ADMIN)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const allUsers = await storage.getAllUsers();
      const allTickets = await storage.getAllTickets();
      const allSettings = await storage.getAllSettings();

      const allAssignments: any[] = [];
      for (const ticket of allTickets) {
        const assignments = await storage.getTicketAssignments(ticket.id);
        allAssignments.push(...assignments);
      }
      const { db: dbExport } = await import("./db");
      const allPerformanceLogs = await dbExport.select().from(performanceLogs);
      const allTechnicianFees = await dbExport.select().from(technicianFees);

      const exportData = {
        exportedAt: new Date().toISOString(),
        version: 1,
        users: allUsers,
        tickets: allTickets,
        assignments: allAssignments,
        performanceLogs: allPerformanceLogs,
        technicianFees: allTechnicianFees,
        settings: allSettings,
      };

      const { gzipSync } = await import("zlib");
      const jsonStr = JSON.stringify(exportData);
      const compressed = gzipSync(Buffer.from(jsonStr), { level: 9 });

      res.setHeader("Content-Type", "application/gzip");
      res.setHeader("Content-Disposition", `attachment; filename=netguard-export-${new Date().toISOString().split('T')[0]}.json.gz`);
      res.setHeader("Content-Length", compressed.length);
      res.send(compressed);
    } catch (err) {
      console.error("Export error:", err);
      res.status(500).json({ message: "Failed to export database" });
    }
  });

  // === IMPORT DATABASE (supports gzip compressed + plain JSON) ===
  app.post("/api/import-database", async (req, res) => {
    try {
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const currentUser = await storage.getUser(userId);
      if (!currentUser || (currentUser.role !== UserRole.SUPERADMIN && currentUser.role !== UserRole.ADMIN)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      let importData: any;
      const rawBody = (req as any).rawBody || (Buffer.isBuffer(req.body) ? req.body : null);

      if (rawBody && rawBody.length >= 2 && rawBody[0] === 0x1f && rawBody[1] === 0x8b) {
        const { gunzipSync } = await import("zlib");
        const decompressed = gunzipSync(rawBody);
        importData = JSON.parse(decompressed.toString("utf-8"));
      } else if (Buffer.isBuffer(req.body)) {
        importData = JSON.parse(req.body.toString("utf-8"));
      } else {
        importData = req.body;
      }

      if (!importData || !importData.version) {
        return res.status(400).json({ message: "Invalid import data format" });
      }

      const { db: dbInstance } = await import("./db");

      const counts = { users: 0, tickets: 0, assignments: 0, performanceLogs: 0, settings: 0, technicianFees: 0 };

      await dbInstance.delete(performanceLogs);
      await dbInstance.delete(ticketAssignments);
      await dbInstance.delete(tickets);
      await dbInstance.delete(technicianFees);

      const existingUsers = await storage.getAllUsers();
      const existingUserMap = new Map(existingUsers.map(u => [u.username, u]));

      const userIdMap = new Map<number, number>();

      if (importData.users && Array.isArray(importData.users)) {
        for (const u of importData.users) {
          const existing = existingUserMap.get(u.username);
          if (existing) {
            const updates: any = {
              name: u.name,
              email: u.email,
              phone: u.phone || "",
              role: u.role,
              isBackboneSpecialist: u.isBackboneSpecialist || false,
              isVendorSpecialist: u.isVendorSpecialist || false,
              isActive: u.isActive !== undefined ? u.isActive : true,
            };
            if (u.password) {
              updates.password = u.password;
            }
            await storage.updateUser(existing.id, updates);
            userIdMap.set(u.id, existing.id);
            counts.users++;
          } else {
            const pwd = u.password || await hash("changeme123", 10);
            const newUser = await storage.createUser({
              name: u.name,
              email: u.email,
              username: u.username,
              password: pwd,
              phone: u.phone || "",
              role: u.role,
              isBackboneSpecialist: u.isBackboneSpecialist || false,
              isVendorSpecialist: u.isVendorSpecialist || false,
              isActive: u.isActive !== undefined ? u.isActive : true,
            });
            userIdMap.set(u.id, newUser.id);
            counts.users++;
          }
        }
      }

      const ticketIdMap = new Map<number, number>();

      if (importData.tickets && Array.isArray(importData.tickets)) {
        for (const t of importData.tickets) {
          const { id, ...ticketData } = t;
          const [newTicket] = await dbInstance.insert(tickets).values({
            ...ticketData,
            slaDeadline: t.slaDeadline ? new Date(t.slaDeadline) : new Date(),
            createdAt: t.createdAt ? new Date(t.createdAt) : new Date(),
            closedAt: t.closedAt ? new Date(t.closedAt) : null,
          }).returning();
          ticketIdMap.set(id, newTicket.id);
          counts.tickets++;
        }
      }

      if (importData.assignments && Array.isArray(importData.assignments)) {
        for (const a of importData.assignments) {
          const mappedTicketId = ticketIdMap.get(a.ticketId);
          const mappedUserId = userIdMap.get(a.userId);
          if (mappedTicketId && mappedUserId) {
            await dbInstance.insert(ticketAssignments).values({
              ticketId: mappedTicketId,
              userId: mappedUserId,
              assignedAt: a.assignedAt ? new Date(a.assignedAt) : new Date(),
              active: a.active !== undefined ? a.active : true,
              assignmentType: a.assignmentType || "manual",
            });
            counts.assignments++;
          }
        }
      }

      if (importData.performanceLogs && Array.isArray(importData.performanceLogs)) {
        for (const pl of importData.performanceLogs) {
          const mappedTicketId = ticketIdMap.get(pl.ticketId);
          const mappedUserId = userIdMap.get(pl.userId);
          if (mappedTicketId && mappedUserId) {
            await dbInstance.insert(performanceLogs).values({
              userId: mappedUserId,
              ticketId: mappedTicketId,
              result: pl.result,
              completedWithinSLA: pl.completedWithinSLA,
              durationMinutes: pl.durationMinutes,
              ticketFee: pl.ticketFee || "0",
              transportFee: pl.transportFee || "0",
              bonus: pl.bonus || "0",
              createdAt: pl.createdAt ? new Date(pl.createdAt) : new Date(),
            });
            counts.performanceLogs++;
          }
        }
      }

      if (importData.technicianFees && Array.isArray(importData.technicianFees)) {
        for (const tf of importData.technicianFees) {
          const mappedUserId = userIdMap.get(tf.technicianId);
          if (mappedUserId) {
            await dbInstance.insert(technicianFees).values({
              technicianId: mappedUserId,
              ticketType: tf.ticketType,
              ticketFee: tf.ticketFee || "0",
              transportFee: tf.transportFee || "0",
            });
            counts.technicianFees++;
          }
        }
      }

      if (importData.settings && Array.isArray(importData.settings)) {
        for (const s of importData.settings) {
          await storage.setSetting(s.key, s.value);
          counts.settings++;
        }
      }

      await fixOrphanedAssignments();

      res.json({
        message: `Import completed: ${counts.users} users, ${counts.tickets} tickets, ${counts.assignments} assignments, ${counts.performanceLogs} perf logs, ${counts.technicianFees} tech fees, ${counts.settings} settings`,
        ...counts,
      });
    } catch (err: any) {
      console.error("Import error:", err);
      res.status(500).json({ message: err.message || "Failed to import database" });
    }
  });

  // === BULK RESET STALE ASSIGNMENTS ===
  app.post("/api/bulk-reset-assignments", async (req, res) => {
    try {
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== UserRole.SUPERADMIN && user.role !== UserRole.ADMIN)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const parsedMaxAge = Number(req.body?.maxAgeHours);
      const maxAgeHours = Number.isFinite(parsedMaxAge) && parsedMaxAge > 0 ? parsedMaxAge : 24;
      const count = await storage.bulkResetStaleAssignments(maxAgeHours);
      res.json({ reset: count, message: `${count} ticket(s) unassigned` });
    } catch (err) {
      console.error("Bulk reset error:", err);
      res.status(500).json({ message: "Failed to reset assignments" });
    }
  });

  // === REPORTS ===
  app.get(api.reports.tickets.path, async (req, res) => {
    try {
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role === UserRole.TECHNICIAN) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        type: req.query.type as string | undefined,
        status: req.query.status as string | undefined,
      };
      const page = Math.max(1, parseInt((req.query.page as string | undefined) ?? "") || 1);
      let perPage = parseInt((req.query.perPage as string | undefined) ?? "");
      if (isNaN(perPage) || perPage <= 0) perPage = 20;
      if (perPage > 100) perPage = 100;

      const { tickets, total } = await storage.getTicketsReport(filters, {
        skip: (page - 1) * perPage,
        take: perPage,
      });

      res.json({ tickets, total, page, perPage });
    } catch (err) {
      console.error("Report error:", err);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  app.get(api.reports.bonusSummary.path, async (req, res) => {
    try {
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role === UserRole.TECHNICIAN) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const data = await storage.getBonusSummary(filters);
      res.json(data);
    } catch (err) {
      console.error("Bonus report error:", err);
      res.status(500).json({ message: "Failed to generate bonus report" });
    }
  });

  app.get(api.reports.performanceSummary.path, async (req, res) => {
    try {
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role === UserRole.TECHNICIAN) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const data = await storage.getPerformanceSummary(filters);
      res.json(data);
    } catch (err) {
      console.error("Performance report error:", err);
      res.status(500).json({ message: "Failed to generate performance report" });
    }
  });

  app.get(api.reports.technicianPeriod.path, async (req, res) => {
    try {
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role === UserRole.TECHNICIAN) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const cutoffSetting = await storage.getSetting("cutoff_day");
      const cutoffDay = clampCutoffDay(cutoffSetting?.value);
      const { start, end } = computePerformancePeriod(new Date(), cutoffDay);

      const maintSetting = await storage.getSetting("preference_ratio_maintenance");
      const installSetting = await storage.getSetting("preference_ratio_installation");
      const parsedMaint = parseInt(maintSetting?.value ?? "4", 10);
      const parsedInstall = parseInt(installSetting?.value ?? "2", 10);
      const maintValue = Number.isNaN(parsedMaint) ? 4 : parsedMaint;
      const installValue = Number.isNaN(parsedInstall) ? 2 : parsedInstall;
      const dailyTarget = Math.max(1, maintValue + installValue);

      const rows = await storage.getTechnicianDailyPerformance(start, end);
      const days = generatePeriodDays(start, end);
      const monthlyTarget = dailyTarget * days.length;

      const grouped = new Map<number, { technicianId: number; technicianName: string; dailyCounts: Record<string, number>; total: number }>();
      rows.forEach((row) => {
        const bucket = grouped.get(row.technicianId);
        if (bucket) {
          bucket.dailyCounts[row.day] = row.solved;
          bucket.total += row.solved;
        } else {
          grouped.set(row.technicianId, {
            technicianId: row.technicianId,
            technicianName: row.technicianName,
            dailyCounts: { [row.day]: row.solved },
            total: row.solved,
          });
        }
      });

      const resultRows = Array.from(grouped.values())
        .map((entry) => ({
          ...entry,
          performancePercent: monthlyTarget > 0 ? Number(((entry.total / monthlyTarget) * 100).toFixed(2)) : 0,
        }))
        .sort((a, b) => b.total - a.total);

      res.json({
        start: start.toISOString(),
        end: end.toISOString(),
        days,
        dailyTarget,
        monthlyTarget,
        rows: resultRows,
      });
    } catch (err) {
      console.error("Technician period report error:", err);
      res.status(500).json({ message: "Failed to build technician period report" });
    }
  });

  // === TECHNICIAN BONUS TOTAL ===
  app.get("/api/technician/bonus-total", async (req, res) => {
    try {
      const userId = (req as any).session.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const data = await storage.getTechnicianBonusTotal(userId);
      res.json(data);
    } catch (err) {
      console.error("Bonus total error:", err);
      res.status(500).json({ message: "Failed to fetch bonus total" });
    }
  });

  // === FILE UPLOAD (Local) ===
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    try {
      const ext = path.extname(req.file.originalname);
      const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
      const filepath = path.join(uploadsDir, filename);
      
      fs.writeFileSync(filepath, req.file.buffer);
      
      const url = `/uploads/${filename}`;
      res.json({ url });
    } catch (err) {
      console.error("Upload Error:", err);
      res.status(500).json({ message: "Upload failed" });
    }
  });

  app.post("/api/upload/multiple", upload.array("files", 10), async (req, res) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ message: "No files uploaded" });

    try {
      const urls: string[] = [];
      for (const file of files) {
        const ext = path.extname(file.originalname);
        const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
        const filepath = path.join(uploadsDir, filename);
        
        fs.writeFileSync(filepath, file.buffer);
        urls.push(`/uploads/${filename}`);
      }
      
      res.json({ urls });
    } catch (err) {
      console.error("Upload Error:", err);
      res.status(500).json({ message: "Upload failed" });
    }
  });

  // === SLA CHECKER (Background Job) ===

  // === SEED DATA ===
  await seedDatabase();

  return httpServer;
}

async function seedDatabase() {
  const existingUsers = await storage.getAllUsers();
  if (existingUsers.length > 0) return;

  console.log("Seeding database...");

  const passwordHash = await hash("Admin!123#", 10);

  await storage.createUser({
    name: "Adhie Lesmana",
    email: "adhielesmana@isp.com",
    username: "adhielesmana",
    password: passwordHash,
    role: UserRole.SUPERADMIN,
    phone: "1234567890",
    isBackboneSpecialist: false,
    isActive: true,
  });

  const tech1 = await storage.createUser({
    name: "John Tech",
    email: "tech1@isp.com",
    username: "tech1",
    password: passwordHash,
    role: UserRole.TECHNICIAN,
    phone: "5556667777",
    isBackboneSpecialist: false,
    isActive: true,
  });

  await storage.createUser({
    name: "Backbone Bob",
    email: "backbone@isp.com",
    username: "backbone",
    password: passwordHash,
    role: UserRole.TECHNICIAN,
    phone: "9998887777",
    isBackboneSpecialist: true,
    isActive: true,
  });

  await storage.createUser({
    name: "Helpdesk Helen",
    email: "helpdesk@isp.com",
    username: "helpdesk",
    password: passwordHash,
    role: UserRole.HELPDESK,
    phone: "1112223333",
    isBackboneSpecialist: false,
    isActive: true,
  });

  const now = new Date();
  
  await storage.createTicket({
    ticketNumber: "INC-1001",
    type: TicketType.HOME_MAINTENANCE,
    priority: TicketPriority.HIGH,
    status: TicketStatus.OPEN,
    customerName: "Alice Johnson",
    customerPhone: "123-456-7890",
    customerLocationUrl: "https://maps.google.com/?q=40.7128,-74.0060",
    title: "No Internet Connection",
    description: "Customer reports red LOS light on modem.",
    slaDeadline: new Date(now.getTime() + 24 * 60 * 60 * 1000),
  });

  const t2 = await storage.createTicket({
    ticketNumber: "INC-1002",
    type: TicketType.INSTALLATION,
    priority: TicketPriority.MEDIUM,
    status: TicketStatus.ASSIGNED,
    customerName: "Bob Smith",
    customerPhone: "987-654-3210",
    customerLocationUrl: "https://maps.google.com/?q=34.0522,-118.2437",
    title: "New Installation",
    description: "Install 100Mbps plan.",
    slaDeadline: new Date(now.getTime() + 72 * 60 * 60 * 1000),
  });
  await storage.assignTicket(t2.id, tech1.id, "manual");

  await storage.createTicket({
    ticketNumber: "INC-1003",
    type: TicketType.HOME_MAINTENANCE,
    priority: TicketPriority.LOW,
    status: TicketStatus.OPEN,
    customerName: "Carol Williams",
    customerPhone: "555-111-2222",
    customerLocationUrl: "https://maps.google.com/?q=41.8781,-87.6298",
    title: "Slow Internet Speed",
    description: "Customer reports speed drops during evening hours.",
    slaDeadline: new Date(now.getTime() + 24 * 60 * 60 * 1000),
  });

  console.log("Seeding complete.");
}

export async function fixOrphanedAssignments() {
  try {
    const allTickets = await storage.getAllTickets({});
    const candidateTickets = allTickets.filter((t: any) => 
      t.status === 'assigned' || t.status === 'in_progress' || t.status === 'waiting_assignment'
    );
    let fixed = 0;
    for (const ticket of candidateTickets) {
      const assignments = await storage.getTicketAssignments(ticket.id);
      const activeAssignments = assignments.filter((a: any) => a.active);
      if (activeAssignments.length === 0) {
        await storage.updateTicket(ticket.id, { status: 'open' });
        fixed++;
        console.log(`  Fixed orphaned ticket ${ticket.id} (${ticket.ticketNumber}): ${ticket.status} → open`);
      }
    }
    if (fixed > 0) {
      console.log(`Fixed ${fixed} orphaned ticket(s) with no active assignments.`);
    }
  } catch (err) {
    console.error("Fix orphaned assignments error:", err);
  }
}

export async function fixLegacyOverdueStatus() {
  try {
    const allTickets = await storage.getAllTickets({});
    const overdueTickets = allTickets.filter((t: any) => t.status === 'overdue');
    if (overdueTickets.length === 0) return;
    console.log(`Fixing ${overdueTickets.length} tickets with legacy 'overdue' status...`);
    for (const ticket of overdueTickets) {
      await storage.updateTicket(ticket.id, { status: 'assigned' });
      console.log(`  Ticket ${ticket.id}: status changed from 'overdue' to 'assigned'`);
    }
    console.log("Legacy overdue status fix complete.");
  } catch (err) {
    console.error("Fix legacy overdue status error:", err);
  }
}

export async function backfillTicketAreas() {
  try {
    const allTickets = await storage.getAllTickets({});
    const ticketsWithoutArea = allTickets.filter((t: any) => !t.area && t.customerLocationUrl);
    if (ticketsWithoutArea.length === 0) return;
    console.log(`Backfilling area for ${ticketsWithoutArea.length} tickets...`);
    for (const ticket of ticketsWithoutArea) {
      try {
        const coords = await extractCoordsWithResolve(ticket.customerLocationUrl);
        if (coords) {
          const area = await reverseGeocodeArea(coords.lat, coords.lng);
          if (area) {
            await storage.updateTicket(ticket.id, { area });
            console.log(`  Ticket ${ticket.id}: area set to "${area}"`);
          } else {
            console.log(`  Ticket ${ticket.id}: geocode returned null for ${coords.lat},${coords.lng}`);
          }
        } else {
          console.log(`  Ticket ${ticket.id}: no coords from URL: ${ticket.customerLocationUrl}`);
        }
      } catch (e: any) {
        console.log(`  Ticket ${ticket.id}: error - ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 1100));
    }
    console.log("Area backfill complete.");
  } catch (err) {
    console.error("Area backfill error:", err);
  }
}
