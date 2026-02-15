import { db } from "./db";
import { 
  users, tickets, ticketAssignments, performanceLogs, settings,
  type User, type InsertUser, 
  type Ticket, type InsertTicket,
  type TicketAssignment, type InsertAssignment,
  type PerformanceLog, type InsertPerformanceLog,
  type Setting, type InsertSetting,
  type TechnicianPerformance,
  TicketStatus
} from "@shared/schema";
import { eq, or, and, sql, desc, asc } from "drizzle-orm";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(role?: string): Promise<User[]>;
  updateUser(id: number, updates: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: number): Promise<void>;

  getTicket(id: number): Promise<Ticket | undefined>;
  getTicketByNumber(ticketNumber: string): Promise<Ticket | undefined>;
  createTicket(ticket: InsertTicket): Promise<Ticket>;
  updateTicket(id: number, ticket: Partial<InsertTicket>): Promise<Ticket>;
  getAllTickets(filters?: any): Promise<Ticket[]>;
  getTicketsByAssignee(userId: number): Promise<Ticket[]>;
  deleteTicket(id: number): Promise<void>;

  assignTicket(ticketId: number, userId: number, assignmentType?: string): Promise<TicketAssignment>;
  assignTicketWithPartner(ticketId: number, userId: number, partnerId: number, assignmentType?: string): Promise<void>;
  getTicketAssignment(ticketId: number): Promise<TicketAssignment | undefined>;
  getTicketAssignments(ticketId: number): Promise<TicketAssignment[]>;
  getAssigneeForTicket(ticketId: number): Promise<User | undefined>;
  getAssigneesForTicket(ticketId: number): Promise<User[]>;
  getActiveTicketForUser(userId: number): Promise<Ticket | undefined>;
  getOldestOpenTicket(isBackboneSpecialist?: boolean): Promise<Ticket | undefined>;
  getFreeTechnicians(excludeUserId?: number): Promise<User[]>;

  logPerformance(log: InsertPerformanceLog): Promise<PerformanceLog>;
  getTechnicianPerformance(userId: number): Promise<TechnicianPerformance>;

  getSetting(key: string): Promise<Setting | undefined>;
  setSetting(key: string, value: string | null): Promise<Setting>;
  getAllSettings(): Promise<Setting[]>;

  getTicketsReport(filters?: { dateFrom?: string; dateTo?: string; type?: string; status?: string }): Promise<any[]>;
  getBonusSummary(filters?: { dateFrom?: string; dateTo?: string }): Promise<any[]>;
  getPerformanceSummary(filters?: { dateFrom?: string; dateTo?: string }): Promise<any[]>;
  getTechnicianBonusTotal(userId: number): Promise<{ totalBonus: number; ticketCount: number }>;

  getDashboardStats(): Promise<{
    totalOpen: number;
    totalAssigned: number;
    totalClosed: number;
    slaBreachCount: number;
  }>;
}

export class DatabaseStorage implements IStorage {
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

  async updateUser(id: number, updates: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: number): Promise<void> {
    await db.delete(ticketAssignments).where(eq(ticketAssignments.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }

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

  async deleteTicket(id: number): Promise<void> {
    await db.delete(ticketAssignments).where(eq(ticketAssignments.ticketId, id));
    await db.delete(tickets).where(eq(tickets.id, id));
  }

  async assignTicket(ticketId: number, userId: number, assignmentType: string = "manual"): Promise<TicketAssignment> {
    const currentAssignments = await this.getTicketAssignments(ticketId);
    
    if (currentAssignments.some(a => a.userId === userId)) {
      return currentAssignments.find(a => a.userId === userId)!;
    }
    
    if (currentAssignments.length >= 2) {
      throw new Error("Maximum 2 assignees per ticket");
    }
    
    const [assignment] = await db.insert(ticketAssignments)
      .values({ ticketId, userId, active: true, assignmentType })
      .returning();
      
    return assignment;
  }

  async assignTicketWithPartner(ticketId: number, userId: number, partnerId: number, assignmentType: string = "auto"): Promise<void> {
    await db.update(ticketAssignments)
      .set({ active: false })
      .where(eq(ticketAssignments.ticketId, ticketId));

    await db.insert(ticketAssignments)
      .values([
        { ticketId, userId, active: true, assignmentType },
        { ticketId, userId: partnerId, active: true, assignmentType },
      ]);
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

  async getTicketAssignments(ticketId: number): Promise<TicketAssignment[]> {
    return db.select()
      .from(ticketAssignments)
      .where(and(
        eq(ticketAssignments.ticketId, ticketId),
        eq(ticketAssignments.active, true)
      ))
      .orderBy(asc(ticketAssignments.id));
  }
  
  async getAssigneeForTicket(ticketId: number): Promise<User | undefined> {
    const assignment = await this.getTicketAssignment(ticketId);
    if (!assignment) return undefined;
    return this.getUser(assignment.userId);
  }

  async getAssigneesForTicket(ticketId: number): Promise<User[]> {
    const assignments = await this.getTicketAssignments(ticketId);
    const userPromises = assignments.map(a => this.getUser(a.userId));
    const results = await Promise.all(userPromises);
    return results.filter((u): u is User => u !== undefined);
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

  async getOldestOpenTicket(isBackboneSpecialist?: boolean): Promise<Ticket | undefined> {
    let query = db.select().from(tickets).$dynamic();
    
    if (isBackboneSpecialist) {
      query = query.where(
        and(
          eq(tickets.status, TicketStatus.OPEN),
          eq(tickets.type, "backbone_maintenance")
        )
      );
    } else {
      query = query.where(
        and(
          eq(tickets.status, TicketStatus.OPEN),
          sql`${tickets.type} != 'backbone_maintenance'`
        )
      );
    }

    const results = await query.orderBy(asc(tickets.createdAt)).limit(1);
    return results[0];
  }

  async getFreeTechnicians(excludeUserId?: number): Promise<User[]> {
    const busyTechIds = db
      .select({ userId: ticketAssignments.userId })
      .from(ticketAssignments)
      .innerJoin(tickets, eq(tickets.id, ticketAssignments.ticketId))
      .where(
        and(
          eq(ticketAssignments.active, true),
          or(
            eq(tickets.status, TicketStatus.ASSIGNED),
            eq(tickets.status, TicketStatus.IN_PROGRESS)
          )
        )
      );

    const allTechs = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.role, "technician"),
          eq(users.isActive, true),
          sql`${users.id} NOT IN (${busyTechIds})`
        )
      );

    if (excludeUserId) {
      return allTechs.filter(u => u.id !== excludeUserId);
    }
    return allTechs;
  }

  async logPerformance(log: InsertPerformanceLog): Promise<PerformanceLog> {
    const [entry] = await db.insert(performanceLogs).values(log).returning();
    return entry;
  }

  async getTechnicianPerformance(userId: number): Promise<TechnicianPerformance> {
    const [stats] = await db.select({
      totalCompleted: sql<number>`count(*)`,
      slaComplianceCount: sql<number>`count(case when ${performanceLogs.completedWithinSLA} = true then 1 end)`,
      avgResolutionMinutes: sql<number>`coalesce(avg(${performanceLogs.durationMinutes}), 0)`,
      totalOverdue: sql<number>`count(case when ${performanceLogs.completedWithinSLA} = false then 1 end)`,
    }).from(performanceLogs).where(eq(performanceLogs.userId, userId));

    const totalCompleted = Number(stats.totalCompleted) || 0;
    const slaComplianceCount = Number(stats.slaComplianceCount) || 0;

    return {
      totalCompleted,
      slaComplianceRate: totalCompleted > 0 ? Math.round((slaComplianceCount / totalCompleted) * 100) : 100,
      avgResolutionMinutes: Math.round(Number(stats.avgResolutionMinutes) || 0),
      totalOverdue: Number(stats.totalOverdue) || 0,
    };
  }

  async getSetting(key: string): Promise<Setting | undefined> {
    const [setting] = await db.select().from(settings).where(eq(settings.key, key));
    return setting;
  }

  async setSetting(key: string, value: string | null): Promise<Setting> {
    const existing = await this.getSetting(key);
    if (existing) {
      const [updated] = await db.update(settings)
        .set({ value, updatedAt: new Date() })
        .where(eq(settings.key, key))
        .returning();
      return updated;
    }
    const [created] = await db.insert(settings)
      .values({ key, value })
      .returning();
    return created;
  }

  async getAllSettings(): Promise<Setting[]> {
    return await db.select().from(settings);
  }

  async getTicketsReport(filters: { dateFrom?: string; dateTo?: string; type?: string; status?: string } = {}): Promise<any[]> {
    let query = db.select().from(tickets).$dynamic();
    const conditions = [];
    
    if (filters.type) conditions.push(eq(tickets.type, filters.type));
    if (filters.status) conditions.push(eq(tickets.status, filters.status));
    if (filters.dateFrom) conditions.push(sql`${tickets.createdAt} >= ${filters.dateFrom}::timestamp`);
    if (filters.dateTo) conditions.push(sql`${tickets.createdAt} <= ${filters.dateTo}::timestamp + interval '1 day'`);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    const ticketRows = await query.orderBy(desc(tickets.createdAt));
    const result: any[] = [];
    for (const ticket of ticketRows) {
      const assignees = await this.getAssigneesForTicket(ticket.id);
      result.push({
        ...ticket,
        assignees: assignees.map(a => ({ id: a.id, name: a.name })),
      });
    }
    return result;
  }

  async getBonusSummary(filters: { dateFrom?: string; dateTo?: string } = {}): Promise<any[]> {
    const conditions = [eq(tickets.status, TicketStatus.CLOSED)];
    if (filters.dateFrom) conditions.push(sql`${tickets.closedAt} >= ${filters.dateFrom}::timestamp`);
    if (filters.dateTo) conditions.push(sql`${tickets.closedAt} <= ${filters.dateTo}::timestamp + interval '1 day'`);

    const closedTickets = await db.select().from(tickets).where(and(...conditions)).orderBy(desc(tickets.closedAt));
    
    const result: any[] = [];
    for (const ticket of closedTickets) {
      const assignees = await this.getAssigneesForTicket(ticket.id);
      result.push({
        ...ticket,
        assignees: assignees.map(a => ({ id: a.id, name: a.name })),
      });
    }
    return result;
  }

  async getPerformanceSummary(filters: { dateFrom?: string; dateTo?: string } = {}): Promise<any[]> {
    const conditions: any[] = [];
    if (filters.dateFrom) conditions.push(sql`${performanceLogs.createdAt} >= ${filters.dateFrom}::timestamp`);
    if (filters.dateTo) conditions.push(sql`${performanceLogs.createdAt} <= ${filters.dateTo}::timestamp + interval '1 day'`);

    const techs = await db.select().from(users).where(eq(users.role, "technician"));
    
    const result: any[] = [];
    for (const tech of techs) {
      const techConditions = [eq(performanceLogs.userId, tech.id), ...conditions];
      const [stats] = await db.select({
        totalCompleted: sql<number>`count(*)`,
        slaComplianceCount: sql<number>`count(case when ${performanceLogs.completedWithinSLA} = true then 1 end)`,
        avgResolutionMinutes: sql<number>`coalesce(avg(${performanceLogs.durationMinutes}), 0)`,
        totalOverdue: sql<number>`count(case when ${performanceLogs.completedWithinSLA} = false then 1 end)`,
      }).from(performanceLogs).where(and(...techConditions));

      const bonusConditions = [
        eq(tickets.status, TicketStatus.CLOSED),
        sql`${tickets.id} IN (SELECT ticket_id FROM ticket_assignments WHERE user_id = ${tech.id} AND active = true)`,
      ];
      if (filters.dateFrom) bonusConditions.push(sql`${tickets.closedAt} >= ${filters.dateFrom}::timestamp`);
      if (filters.dateTo) bonusConditions.push(sql`${tickets.closedAt} <= ${filters.dateTo}::timestamp + interval '1 day'`);

      const [bonusResult] = await db.select({
        totalBonus: sql<number>`coalesce(sum(${tickets.bonus}::numeric), 0)`,
      }).from(tickets).where(and(...bonusConditions));

      const totalCompleted = Number(stats.totalCompleted) || 0;
      const slaComplianceCount = Number(stats.slaComplianceCount) || 0;

      result.push({
        technicianId: tech.id,
        technicianName: tech.name,
        totalCompleted,
        slaComplianceRate: totalCompleted > 0 ? Math.round((slaComplianceCount / totalCompleted) * 100) : 100,
        avgResolutionMinutes: Math.round(Number(stats.avgResolutionMinutes) || 0),
        totalOverdue: Number(stats.totalOverdue) || 0,
        totalBonus: Number(bonusResult.totalBonus) || 0,
      });
    }
    return result;
  }

  async getTechnicianBonusTotal(userId: number): Promise<{ totalBonus: number; ticketCount: number }> {
    const [result] = await db.select({
      totalBonus: sql<number>`coalesce(sum(${tickets.bonus}::numeric), 0)`,
      ticketCount: sql<number>`count(*)`,
    }).from(tickets)
      .innerJoin(ticketAssignments, eq(tickets.id, ticketAssignments.ticketId))
      .where(and(
        eq(ticketAssignments.userId, userId),
        eq(ticketAssignments.active, true),
        eq(tickets.status, TicketStatus.CLOSED)
      ));

    return {
      totalBonus: Number(result.totalBonus) || 0,
      ticketCount: Number(result.ticketCount) || 0,
    };
  }

  async getDashboardStats(): Promise<{
    totalOpen: number;
    totalAssigned: number;
    totalClosed: number;
    slaBreachCount: number;
  }> {
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
