import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api, errorSchemas } from "@shared/routes";
import { z } from "zod";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import multer from "multer";
import { TicketStatus, UserRole, TicketPriority, TicketType } from "@shared/schema";
import { hash, compare } from "bcryptjs";

// S3 Configuration
const s3Client = new S3Client({
  region: "us-east-1", // Default region, can be overriden by endpoint
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  },
  forcePathStyle: true, // Needed for some S3 compatible providers
});

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // === AUTH ===
  app.post(api.auth.login.path, async (req, res) => {
    try {
      const { username, password } = api.auth.login.input.parse(req.body);
      const user = await storage.getUserByUsername(username);
      
      if (!user || !(await compare(password, user.password))) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      // In a real app, we would use sessions or JWT. 
      // For this MVP, we'll return the user object and frontend can store it.
      // Ideally use express-session with the existing setup.
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

  // === TICKETS ===
  app.get(api.tickets.list.path, async (req, res) => {
    try {
      // Parse query params using the schema to ensure types
      // Express query params are strings, so we might need manual coercion if not using z.coerce in schema
      // But for simple enums and strings it's fine.
      const userId = (req as any).session.userId;
      const user = userId ? await storage.getUser(userId) : undefined;

      let filters = req.query;

      // Technicians only see their own tickets unless they are filtering specifically?
      // The spec says "View assigned ticket only" for Technician.
      if (user?.role === UserRole.TECHNICIAN) {
         const myTickets = await storage.getTicketsByAssignee(user.id);
         // Apply other filters in memory or improve storage method
         // For MVP, just return assigned tickets
         return res.json(myTickets.map(t => ({ ...t, assignee: user })));
      }

      const tickets = await storage.getAllTickets(filters);
      
      // Enrich with assignee
      const ticketsWithAssignee = await Promise.all(tickets.map(async (ticket) => {
        const assignee = await storage.getAssigneeForTicket(ticket.id);
        return { ...ticket, assignee };
      }));

      res.json(ticketsWithAssignee);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.tickets.get.path, async (req, res) => {
    const ticket = await storage.getTicket(Number(req.params.id));
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    
    const assignee = await storage.getAssigneeForTicket(ticket.id);
    res.json({ ...ticket, assignee });
  });

  app.post(api.tickets.create.path, async (req, res) => {
    try {
      const input = api.tickets.create.input.parse(req.body);
      
      // Calculate SLA Deadline
      const now = new Date();
      let slaHours = 24;
      if (input.type === TicketType.INSTALLATION) slaHours = 72;
      const slaDeadline = new Date(now.getTime() + slaHours * 60 * 60 * 1000);

      const ticket = await storage.createTicket({
        ...input,
        slaDeadline,
        status: TicketStatus.OPEN,
      });

      // Auto-assign logic could go here
      // For now, we leave it open as per spec "Manual assignment" is also a thing

      res.status(201).json(ticket);
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

  app.patch(api.tickets.update.path, async (req, res) => {
    try {
      const input = api.tickets.update.input.parse(req.body);
      const ticket = await storage.updateTicket(Number(req.params.id), input);
      res.json(ticket);
    } catch (err) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.post(api.tickets.assign.path, async (req, res) => {
    const ticketId = Number(req.params.id);
    const { userId } = req.body; // If undefined, try auto-assign?

    if (userId) {
      await storage.assignTicket(ticketId, userId);
      await storage.updateTicket(ticketId, { status: TicketStatus.ASSIGNED });
    } else {
       // Implement auto-assign logic here if needed, or return error
       return res.status(400).json({ message: "User ID required for manual assignment" });
    }
    
    const ticket = await storage.getTicket(ticketId);
    res.json(ticket);
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

    // Calculate duration
    const now = new Date();
    const durationMinutes = Math.floor((now.getTime() - existingTicket.createdAt.getTime()) / 60000);

    const ticket = await storage.updateTicket(ticketId, {
      status: TicketStatus.CLOSED,
      closedAt: now,
      durationMinutes,
      performStatus: existingTicket.slaDeadline > now ? "perform" : "not_perform",
      ...input
    });

    // Log performance
    const assignee = await storage.getAssigneeForTicket(ticketId);
    if (assignee) {
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

  // === DASHBOARD ===
  app.get(api.dashboard.stats.path, async (req, res) => {
    const stats = await storage.getDashboardStats();
    res.json(stats);
  });


  // === FILE UPLOAD (S3) ===
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    try {
      const fileKey = `uploads/${Date.now()}-${req.file.originalname}`;
      const bucketName = process.env.S3_BUCKET;
      
      await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: fileKey,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        // ACL: 'public-read' // Depending on bucket settings
      }));

      // Construct public URL
      // If using generic S3, might be endpoint/bucket/key or bucket.endpoint/key
      // Simplest assumption: endpoint + / + bucket + / + key if endpoint doesn't include bucket
      // Adjust based on provider. Assuming path-style for compatibility.
      const url = `${process.env.S3_ENDPOINT}/${bucketName}/${fileKey}`;
      
      res.json({ url });
    } catch (err) {
      console.error("S3 Upload Error:", err);
      res.status(500).json({ message: "Upload failed" });
    }
  });

  // === SLA CHECKER (Background Job) ===
  setInterval(async () => {
    try {
      const openTickets = await storage.getAllTickets({ 
        // We'd need a way to query "not closed" efficiently
        // For MVP, get all and filter in memory or add 'active' filter to storage
      });

      const now = new Date();
      for (const ticket of openTickets) {
        if (ticket.status !== TicketStatus.CLOSED && ticket.status !== TicketStatus.OVERDUE) {
          if (ticket.slaDeadline < now) {
            await storage.updateTicket(ticket.id, { status: TicketStatus.OVERDUE });
            console.log(`Ticket ${ticket.ticketNumber} marked as OVERDUE`);
          }
        }
      }
    } catch (err) {
      console.error("SLA Checker Error:", err);
    }
  }, 5 * 60 * 1000); // Every 5 minutes

  // === SEED DATA ===
  await seedDatabase();

  return httpServer;
}

async function seedDatabase() {
  const existingUsers = await storage.getAllUsers();
  if (existingUsers.length > 0) return;

  console.log("Seeding database...");

  const passwordHash = await hash("Admin!123#", 10);

  // Superadmin
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

  // Technician
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

  // Backbone Specialist
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

  // Create some tickets
  const now = new Date();
  
  // Open Ticket
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

  // Assigned Ticket
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
  await storage.assignTicket(t2.id, tech1.id);

  console.log("Seeding complete.");
}
