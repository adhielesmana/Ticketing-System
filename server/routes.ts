import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api, errorSchemas } from "@shared/routes";
import { z } from "zod";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import multer from "multer";
import { TicketStatus, UserRole, TicketPriority, TicketType } from "@shared/schema";
import { hash, compare } from "bcryptjs";
import path from "path";
import fs from "fs";

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
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return res.url || url;
  } catch {
    try {
      const res = await fetch(url, { redirect: "follow" });
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

const s3Client = new S3Client({
  region: "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  },
  forcePathStyle: true,
});

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

  app.use('/uploads', (await import('express')).default.static(uploadsDir));

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

  // === USERS ===
  app.get(api.users.list.path, async (req, res) => {
    const role = req.query.role as string | undefined;
    const users = await storage.getAllUsers(role);
    res.json(users);
  });

  app.get(api.users.get.path, async (req, res) => {
    const user = await storage.getUser(Number(req.params.id));
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  });

  app.post(api.users.create.path, async (req, res) => {
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
         const withAssignees = await Promise.all(myTickets.map(async (t) => {
           const assignees = await storage.getAssigneesForTicket(t.id);
           const assignments = await storage.getTicketAssignments(t.id);
           const assignmentType = assignments[0]?.assignmentType || null;
           return { ...t, assignee: assignees[0], assignees, assignmentType };
         }));
         return res.json(withAssignees);
      }

      const tickets = await storage.getAllTickets(req.query);
      
      const ticketsWithAssignee = await Promise.all(tickets.map(async (ticket) => {
        const assignees = await storage.getAssigneesForTicket(ticket.id);
        const assignments = await storage.getTicketAssignments(ticket.id);
        const assignmentType = assignments[0]?.assignmentType || null;
        return { ...ticket, assignee: assignees[0], assignees, assignmentType };
      }));

      res.json(ticketsWithAssignee);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.tickets.get.path, async (req, res) => {
    const ticket = await storage.getTicket(Number(req.params.id));
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    
    const assignees = await storage.getAssigneesForTicket(ticket.id);
    const assignment = await storage.getTicketAssignment(ticket.id);
    res.json({ ...ticket, assignee: assignees[0], assignees, assignmentType: assignment?.assignmentType, assignedAt: assignment?.assignedAt });
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
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "User ID required for manual assignment" });
    }

    try {
      const existingAssignees = await storage.getAssigneesForTicket(ticketId);
      if (existingAssignees.some((a: any) => a.userId === userId || a.id === userId)) {
        return res.status(400).json({ message: "This technician is already assigned to this ticket" });
      }

      await storage.assignTicket(ticketId, userId, "manual");
      await storage.updateTicket(ticketId, { status: TicketStatus.ASSIGNED });
      const ticket = await storage.getTicket(ticketId);
      const assignees = await storage.getAssigneesForTicket(ticketId);
      res.json({ ...ticket, assignee: assignees[0], assignees });
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

      const { technicianIds } = req.body;
      if (!technicianIds || !Array.isArray(technicianIds) || technicianIds.length === 0 || technicianIds.length > 2) {
        return res.status(400).json({ message: "Provide 1 or 2 technician IDs" });
      }

      await storage.removeAllAssignments(ticketId);

      for (const techId of technicianIds) {
        await storage.assignTicket(ticketId, Number(techId), "manual");
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

      // Determine preferred type based on 4:2 ratio (maintenance:installation)
      let preferredType: "maintenance" | "installation" = "maintenance";

      if (!user.isBackboneSpecialist) {
        const counts = await storage.getCompletedTicketsTodayByUser(userId);
        const totalDone = counts.maintenanceCount + counts.installationCount;
        // 4:2 ratio = in every cycle of 6 tickets, 4 should be maintenance, 2 installation
        // Check position in current cycle
        const cyclePosition = totalDone % 6;
        if (cyclePosition < 4) {
          preferredType = "maintenance";
        } else {
          preferredType = "installation";
        }
      }

      // Get last completed ticket today for location proximity
      const lastTicket = await storage.getLastCompletedTicketToday(userId);
      const lastLocation = lastTicket?.customerLocationUrl || null;

      const ticket = await storage.getSmartOpenTicket({
        isBackboneSpecialist: user.isBackboneSpecialist ?? false,
        preferredType,
        lastTicketLocation: lastLocation,
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
    const ticketFee = isWithinSLA ? existingTicket.ticketFee : "0";
    const transportFee = existingTicket.transportFee || "0";
    const bonus = (parseFloat(ticketFee || "0") + parseFloat(transportFee || "0")).toFixed(2);
    const ticket = await storage.updateTicket(ticketId, {
      status: TicketStatus.CLOSED,
      closedAt: now,
      durationMinutes,
      performStatus: isWithinSLA ? "perform" : "not_perform",
      bonus,
      ticketFee,
      transportFee,
      ...input
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

      const ticketFeeHome = (await storage.getSetting("ticket_fee_home_maintenance"))?.value || "0";
      const transportFeeHome = (await storage.getSetting("transport_fee_home_maintenance"))?.value || "0";
      const ticketFeeBackbone = (await storage.getSetting("ticket_fee_backbone_maintenance"))?.value || "0";
      const transportFeeBackbone = (await storage.getSetting("transport_fee_backbone_maintenance"))?.value || "0";
      const ticketFeeInstall = (await storage.getSetting("ticket_fee_installation"))?.value || "0";
      const transportFeeInstall = (await storage.getSetting("transport_fee_installation"))?.value || "0";

      const feeMap: Record<string, { ticketFee: string; transportFee: string }> = {
        home_maintenance: { ticketFee: ticketFeeHome, transportFee: transportFeeHome },
        backbone_maintenance: { ticketFee: ticketFeeBackbone, transportFee: transportFeeBackbone },
        installation: { ticketFee: ticketFeeInstall, transportFee: transportFeeInstall },
      };

      const closedTickets = await storage.getTicketsReport({ status: "closed" });
      let updatedCount = 0;
      let perfUpdatedCount = 0;

      for (const ticket of closedTickets) {
        const fees = feeMap[ticket.type];
        if (!fees) continue;

        const isWithinSLA = ticket.performStatus === "perform";
        const ticketFee = isWithinSLA ? fees.ticketFee : "0";
        const transportFee = fees.transportFee;
        const bonus = (parseFloat(ticketFee) + parseFloat(transportFee)).toFixed(2);

        await storage.updateTicket(ticket.id, {
          ticketFee,
          transportFee,
          bonus,
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
          await storage.logPerformance({
            userId: assignee.id,
            ticketId: ticket.id,
            result: isWithinSLA ? "perform" : "not_perform",
            completedWithinSLA: isWithinSLA,
            durationMinutes,
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
      const data = await storage.getTicketsReport(filters);
      const withAssignees = await Promise.all(data.map(async (t: any) => {
        const assignees = await storage.getAssigneesForTicket(t.id);
        return { ...t, assignees: assignees.map((a: any) => ({ id: a.id, name: a.name })) };
      }));
      res.json(withAssignees);
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
