import { db } from "./db";
import { 
  users, tickets, ticketAssignments, performanceLogs,
  type User, type InsertUser, 
  type Ticket, type InsertTicket,
  type TicketAssignment, type InsertAssignment,
  type PerformanceLog, type InsertPerformanceLog,
  TicketStatus
} from "@shared/schema";
import { eq, or, and, sql, desc } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(role?: string): Promise<User[]>;
  
  // Tickets
  getTicket(id: number): Promise<Ticket | undefined>;
  getTicketByNumber(ticketNumber: string): Promise<Ticket | undefined>;
  createTicket(ticket: InsertTicket): Promise<Ticket>;
  updateTicket(id: number, ticket: Partial<InsertTicket>): Promise<Ticket>;
  getAllTickets(filters?: any): Promise<Ticket[]>;
  getTicketsByAssignee(userId: number): Promise<Ticket[]>;
  
  // Assignments
  assignTicket(ticketId: number, userId: number): Promise<TicketAssignment>;
  getTicketAssignment(ticketId: number): Promise<TicketAssignment | undefined>;
  getAssigneeForTicket(ticketId: number): Promise<User | undefined>;
  getActiveTicketForUser(userId: number): Promise<Ticket | undefined>;
  
  // Performance
  logPerformance(log: InsertPerformanceLog): Promise<PerformanceLog>;
  
  // Dashboard
  getDashboardStats(): Promise<{
    totalOpen: number;
    totalAssigned: number;
    totalClosed: number;
    slaBreachCount: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getAllUsers(role?: string): Promise<User[]> {
    if (role) {
      return await db.select().from(users).where(eq(users.role, role));
    }
    return await db.select().from(users);
  }

  // Tickets
  async getTicket(id: number): Promise<Ticket | undefined> {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id));
    return ticket;
  }

  async getTicketByNumber(ticketNumber: string): Promise<Ticket | undefined> {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.ticketNumber, ticketNumber));
    return ticket;
  }

  async createTicket(insertTicket: InsertTicket): Promise<Ticket> {
    const [ticket] = await db.insert(tickets).values(insertTicket).returning();
    return ticket;
  }

  async updateTicket(id: number, updates: Partial<InsertTicket>): Promise<Ticket> {
    const [ticket] = await db
      .update(tickets)
      .set(updates)
      .where(eq(tickets.id, id))
      .returning();
    return ticket;
  }

  async getAllTickets(filters: any = {}): Promise<Ticket[]> {
    let query = db.select().from(tickets).$dynamic();
    
    const conditions = [];
    if (filters.status) conditions.push(eq(tickets.status, filters.status));
    if (filters.type) conditions.push(eq(tickets.type, filters.type));
    if (filters.priority) conditions.push(eq(tickets.priority, filters.priority));
    if (filters.search) {
      conditions.push(or(
        sql`${tickets.title} ILIKE ${`%${filters.search}%`}`,
        sql`${tickets.ticketNumber} ILIKE ${`%${filters.search}%`}`,
        sql`${tickets.customerName} ILIKE ${`%${filters.search}%`}`
      ));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    return await query.orderBy(desc(tickets.createdAt));
  }

  async getTicketsByAssignee(userId: number): Promise<Ticket[]> {
    // Join tickets with assignments
    const result = await db
      .select({ ticket: tickets })
      .from(tickets)
      .innerJoin(ticketAssignments, eq(tickets.id, ticketAssignments.ticketId))
      .where(and(
        eq(ticketAssignments.userId, userId),
        eq(ticketAssignments.active, true)
      ))
      .orderBy(desc(tickets.createdAt));
      
    return result.map(r => r.ticket);
  }

  // Assignments
  async assignTicket(ticketId: number, userId: number): Promise<TicketAssignment> {
    // Deactivate old assignments
    await db.update(ticketAssignments)
      .set({ active: false })
      .where(eq(ticketAssignments.ticketId, ticketId));
      
    const [assignment] = await db.insert(ticketAssignments)
      .values({ ticketId, userId, active: true })
      .returning();
      
    return assignment;
  }

  async getTicketAssignment(ticketId: number): Promise<TicketAssignment | undefined> {
    const [assignment] = await db.select()
      .from(ticketAssignments)
      .where(and(
        eq(ticketAssignments.ticketId, ticketId),
        eq(ticketAssignments.active, true)
      ));
    return assignment;
  }
  
  async getAssigneeForTicket(ticketId: number): Promise<User | undefined> {
    const assignment = await this.getTicketAssignment(ticketId);
    if (!assignment) return undefined;
    return this.getUser(assignment.userId);
  }

  async getActiveTicketForUser(userId: number): Promise<Ticket | undefined> {
    const [result] = await db
      .select({ ticket: tickets })
      .from(tickets)
      .innerJoin(ticketAssignments, eq(tickets.id, ticketAssignments.ticketId))
      .where(and(
        eq(ticketAssignments.userId, userId),
        eq(ticketAssignments.active, true),
        or(
          eq(tickets.status, TicketStatus.ASSIGNED),
          eq(tickets.status, TicketStatus.IN_PROGRESS)
        )
      ));
      
    return result?.ticket;
  }

  // Performance
  async logPerformance(log: InsertPerformanceLog): Promise<PerformanceLog> {
    const [entry] = await db.insert(performanceLogs).values(log).returning();
    return entry;
  }

  // Dashboard
  async getDashboardStats(): Promise<{
    totalOpen: number;
    totalAssigned: number;
    totalClosed: number;
    slaBreachCount: number;
  }> {
    // Only count active tickets for open/assigned
    const [stats] = await db.select({
      totalOpen: sql<number>`count(case when ${tickets.status} = ${TicketStatus.OPEN} then 1 end)`,
      totalAssigned: sql<number>`count(case when ${tickets.status} IN (${TicketStatus.ASSIGNED}, ${TicketStatus.IN_PROGRESS}) then 1 end)`,
      totalClosed: sql<number>`count(case when ${tickets.status} = ${TicketStatus.CLOSED} then 1 end)`,
      slaBreachCount: sql<number>`count(case when ${tickets.status} = ${TicketStatus.OVERDUE} OR (${tickets.slaDeadline} < NOW() AND ${tickets.status} != ${TicketStatus.CLOSED}) then 1 end)`,
    }).from(tickets);
    
    return {
      totalOpen: Number(stats.totalOpen),
      totalAssigned: Number(stats.totalAssigned),
      totalClosed: Number(stats.totalClosed),
      slaBreachCount: Number(stats.slaBreachCount),
    };
  }
}

export const storage = new DatabaseStorage();
