import { pgTable, text, serial, integer, boolean, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const UserRole = {
  SUPERADMIN: "superadmin",
  ADMIN: "admin",
  HELPDESK: "helpdesk",
  TECHNICIAN: "technician",
} as const;

export const TicketType = {
  HOME_MAINTENANCE: "home_maintenance",
  BACKBONE_MAINTENANCE: "backbone_maintenance",
  INSTALLATION: "installation",
} as const;

export const TicketPriority = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
} as const;

export const TicketStatus = {
  OPEN: "open",
  WAITING_ASSIGNMENT: "waiting_assignment",
  ASSIGNED: "assigned",
  IN_PROGRESS: "in_progress",
  CLOSED: "closed",
  PENDING_REJECTION: "pending_rejection",
  REJECTED: "rejected",
} as const;

export const PerformStatus = {
  PERFORM: "perform",
  NOT_PERFORM: "not_perform",
} as const;

export const AssignmentType = {
  MANUAL: "manual",
  AUTO: "auto",
} as const;

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  phone: text("phone"),
  role: text("role").notNull().default(UserRole.TECHNICIAN),
  isBackboneSpecialist: boolean("is_backbone_specialist").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  ticketNumber: text("ticket_number").notNull().unique(),
  type: text("type").notNull(),
  priority: text("priority").notNull(),
  status: text("status").notNull().default(TicketStatus.OPEN),
  
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerEmail: text("customer_email"),
  customerLocationUrl: text("customer_location_url").notNull(),
  area: text("area"),
  odpInfo: text("odp_info"),
  odpLocation: text("odp_location"),
  ticketIdCustom: text("ticket_id_custom"),
  
  title: text("title").notNull(),
  description: text("description").notNull(),
  descriptionImages: text("description_images").array(),
  actionDescription: text("action_description"),
  proofImageUrl: text("proof_image_url"),
  proofImageUrls: text("proof_image_urls").array(),
  speedtestResult: text("speedtest_result"),
  speedtestImageUrl: text("speedtest_image_url"),
  
  slaDeadline: timestamp("sla_deadline").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
  durationMinutes: integer("duration_minutes"),
  closedReason: text("closed_reason"),
  closedNote: text("closed_note"),
  performStatus: text("perform_status"),
  bonus: numeric("bonus", { precision: 12, scale: 2 }).default("0"),
  ticketFee: numeric("ticket_fee", { precision: 12, scale: 2 }).default("0"),
  transportFee: numeric("transport_fee", { precision: 12, scale: 2 }).default("0"),
  rejectionReason: text("rejection_reason"),
  reopenReason: text("reopen_reason"),
});

export const ticketAssignments = pgTable("ticket_assignments", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull(),
  userId: integer("user_id").notNull(),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  active: boolean("active").default(true).notNull(),
  assignmentType: text("assignment_type").default(AssignmentType.MANUAL).notNull(),
});

export const performanceLogs = pgTable("performance_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  ticketId: integer("ticket_id").notNull(),
  result: text("result").notNull(),
  completedWithinSLA: boolean("completed_within_sla").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ 
  id: true, 
  createdAt: true 
});

export const insertTicketSchema = createInsertSchema(tickets).omit({ 
  id: true, 
  createdAt: true,
  closedAt: true,
  durationMinutes: true,
  performStatus: true
});

export const insertAssignmentSchema = createInsertSchema(ticketAssignments).omit({
  id: true,
  assignedAt: true,
  active: true
});

export const insertPerformanceLogSchema = createInsertSchema(performanceLogs).omit({
  id: true,
  createdAt: true
});

export const insertSettingsSchema = createInsertSchema(settings).omit({
  id: true,
  updatedAt: true
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Ticket = typeof tickets.$inferSelect;
export type InsertTicket = z.infer<typeof insertTicketSchema>;

export type TicketAssignment = typeof ticketAssignments.$inferSelect;
export type InsertAssignment = z.infer<typeof insertAssignmentSchema>;

export type PerformanceLog = typeof performanceLogs.$inferSelect;
export type InsertPerformanceLog = z.infer<typeof insertPerformanceLogSchema>;

export type Setting = typeof settings.$inferSelect;
export type InsertSetting = z.infer<typeof insertSettingsSchema>;

export const TicketStatusValues = Object.values(TicketStatus);
export const TicketPriorityValues = Object.values(TicketPriority);
export const TicketTypeValues = Object.values(TicketType);
export const UserRoleValues = Object.values(UserRole);

export interface LoginResponse {
  user: User;
}

export interface TicketWithAssignment extends Ticket {
  assignee?: User;
}

export interface DashboardStats {
  totalOpen: number;
  totalAssigned: number;
  totalClosed: number;
  slaBreachCount: number;
}

export interface TechnicianPerformance {
  totalCompleted: number;
  slaComplianceRate: number;
  avgResolutionMinutes: number;
  totalOverdue: number;
}
