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
  updateTicket(id: number, ticket: Partial<Ticket>): Promise<Ticket>;
  getAllTickets(filters?: any): Promise<Ticket[]>;
  getTicketsByAssignee(userId: number): Promise<Ticket[]>;
  deleteTicket(id: number): Promise<void>;

  assignTicket(ticketId: number, userId: number, assignmentType?: string): Promise<TicketAssignment>;
  assignTicketWithPartner(ticketId: number, userId: number, partnerId: number, assignmentType?: string): Promise<void>;
  removeAllAssignments(ticketId: number): Promise<void>;
  getTicketAssignment(ticketId: number): Promise<TicketAssignment | undefined>;
  getTicketAssignments(ticketId: number): Promise<TicketAssignment[]>;
  getAssigneeForTicket(ticketId: number): Promise<User | undefined>;
  getAssigneesForTicket(ticketId: number): Promise<User[]>;
  getActiveTicketForUser(userId: number): Promise<Ticket | undefined>;
  getOldestOpenTicket(isBackboneSpecialist?: boolean): Promise<Ticket | undefined>;
  getFreeTechnicians(excludeUserId?: number): Promise<User[]>;
  getCompletedTicketsTodayByUser(userId: number): Promise<{ maintenanceCount: number; installationCount: number }>;
  getLastCompletedTicketToday(userId: number): Promise<Ticket | undefined>;
  getSmartOpenTicket(options: {
    isBackboneSpecialist: boolean;
    preferredType: "maintenance" | "installation";
    lastTicketLocation?: string | null;
  }): Promise<Ticket | undefined>;

  logPerformance(log: InsertPerformanceLog): Promise<PerformanceLog>;
  deletePerformanceLogsForTicket(ticketId: number): Promise<void>;
  getTechnicianPerformance(userId: number): Promise<TechnicianPerformance>;

  getSetting(key: string): Promise<Setting | undefined>;
  setSetting(key: string, value: string | null): Promise<Setting>;
  getAllSettings(): Promise<Setting[]>;

  getTicketsReport(filters?: { dateFrom?: string; dateTo?: string; type?: string; status?: string }): Promise<any[]>;
  getBonusSummary(filters?: { dateFrom?: string; dateTo?: string }): Promise<any[]>;
  getPerformanceSummary(filters?: { dateFrom?: string; dateTo?: string }): Promise<any[]>;
  getTechnicianBonusTotal(userId: number): Promise<{ totalBonus: number; ticketCount: number; totalTicketFee: number; totalTransportFee: number }>;

  getDashboardStats(): Promise<{
    totalOpen: number;
    totalAssigned: number;
    totalClosed: number;
    slaBreachCount: number;
    pendingRejection: number;
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
    if (!insertTicket.ticketIdCustom) {
      const now = new Date();
      const yy = String(now.getFullYear()).slice(2);
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const todayPrefix = `${yy}${mm}${dd}`;

      const todayTickets = await db.select()
        .from(tickets)
        .where(sql`${tickets.ticketIdCustom} LIKE ${todayPrefix + '%'}`)
        .orderBy(desc(tickets.ticketIdCustom))
        .limit(1);

      let nextSeq = 1;
      if (todayTickets.length > 0 && todayTickets[0].ticketIdCustom) {
        const lastSeq = parseInt(todayTickets[0].ticketIdCustom.slice(6));
        if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
      }

      insertTicket = { ...insertTicket, ticketIdCustom: `${todayPrefix}${nextSeq.toString().padStart(4, '0')}` };
    }

    const [ticket] = await db.insert(tickets).values(insertTicket).returning();
    return ticket;
  }

  async updateTicket(id: number, updates: Partial<Ticket>): Promise<Ticket> {
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

  async removeAllAssignments(ticketId: number): Promise<void> {
    await db.update(ticketAssignments)
      .set({ active: false })
      .where(eq(ticketAssignments.ticketId, ticketId));
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
          eq(tickets.status, TicketStatus.IN_PROGRESS),
          eq(tickets.status, TicketStatus.OVERDUE)
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
            eq(tickets.status, TicketStatus.IN_PROGRESS),
            eq(tickets.status, TicketStatus.OVERDUE)
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

  async getCompletedTicketsTodayByUser(userId: number): Promise<{ maintenanceCount: number; installationCount: number }> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const result = await db
      .select({
        type: tickets.type,
        count: sql<number>`count(*)`,
      })
      .from(tickets)
      .innerJoin(ticketAssignments, eq(tickets.id, ticketAssignments.ticketId))
      .where(and(
        eq(ticketAssignments.userId, userId),
        eq(tickets.status, TicketStatus.CLOSED),
        sql`${tickets.closedAt} >= ${todayStart.toISOString()}`
      ))
      .groupBy(tickets.type);

    let maintenanceCount = 0;
    let installationCount = 0;
    for (const row of result) {
      if (row.type === "home_maintenance") {
        maintenanceCount += Number(row.count);
      } else if (row.type === "installation") {
        installationCount += Number(row.count);
      }
    }
    return { maintenanceCount, installationCount };
  }

  async getLastCompletedTicketToday(userId: number): Promise<Ticket | undefined> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [result] = await db
      .select({ ticket: tickets })
      .from(tickets)
      .innerJoin(ticketAssignments, eq(tickets.id, ticketAssignments.ticketId))
      .where(and(
        eq(ticketAssignments.userId, userId),
        eq(tickets.status, TicketStatus.CLOSED),
        sql`${tickets.closedAt} >= ${todayStart.toISOString()}`
      ))
      .orderBy(desc(tickets.closedAt))
      .limit(1);

    return result?.ticket;
  }

  async getSmartOpenTicket(options: {
    isBackboneSpecialist: boolean;
    preferredType: "maintenance" | "installation";
    lastTicketLocation?: string | null;
  }): Promise<Ticket | undefined> {
    const { isBackboneSpecialist, preferredType, lastTicketLocation } = options;

    // Backbone specialists only get backbone_maintenance tickets
    if (isBackboneSpecialist) {
      const candidates = await db.select().from(tickets)
        .where(and(eq(tickets.status, TicketStatus.OPEN), eq(tickets.type, "backbone_maintenance")))
        .orderBy(asc(tickets.createdAt));
      if (candidates.length === 0) return undefined;
      return this.pickBestCandidate(candidates, lastTicketLocation);
    }

    // Non-backbone: try preferred type first, then fallback
    // maintenance = home_maintenance only (non-backbone techs don't get backbone tickets)
    const preferredCondition = preferredType === "installation"
      ? and(eq(tickets.status, TicketStatus.OPEN), eq(tickets.type, "installation"))
      : and(eq(tickets.status, TicketStatus.OPEN), eq(tickets.type, "home_maintenance"));

    const fallbackCondition = preferredType === "installation"
      ? and(eq(tickets.status, TicketStatus.OPEN), eq(tickets.type, "home_maintenance"))
      : and(eq(tickets.status, TicketStatus.OPEN), eq(tickets.type, "installation"));

    // Try preferred type first
    let candidates = await db.select().from(tickets)
      .where(preferredCondition)
      .orderBy(asc(tickets.createdAt));

    // Fallback: if no preferred type available, try the other type
    if (candidates.length === 0) {
      candidates = await db.select().from(tickets)
        .where(fallbackCondition)
        .orderBy(asc(tickets.createdAt));
    }

    if (candidates.length === 0) return undefined;
    return this.pickBestCandidate(candidates, lastTicketLocation);
  }

  private pickBestCandidate(candidates: Ticket[], lastTicketLocation?: string | null): Ticket {
    const now = new Date();

    // Rule 0: Overdue tickets (past SLA deadline) get absolute highest priority
    const overdue = candidates.filter(t => t.slaDeadline && new Date(t.slaDeadline) < now);
    const notOverdue = candidates.filter(t => !t.slaDeadline || new Date(t.slaDeadline) >= now);

    // If there are overdue tickets, pick from them first (most overdue = earliest deadline)
    if (overdue.length > 0) {
      overdue.sort((a, b) => new Date(a.slaDeadline).getTime() - new Date(b.slaDeadline).getTime());
      return overdue[0];
    }

    const lastCoords = lastTicketLocation ? parseGoogleMapsCoords(lastTicketLocation) : null;

    // Rule 1: If same day has a last job, find the nearest location (within 10km)
    if (lastCoords) {
      const withDistance = notOverdue.map(t => {
        const ticketCoords = parseGoogleMapsCoords(t.customerLocationUrl);
        const dist = ticketCoords
          ? haversineDistance(lastCoords.lat, lastCoords.lng, ticketCoords.lat, ticketCoords.lng)
          : Infinity;
        return { ticket: t, distance: dist };
      });

      const nearbyThreshold = 10; // km
      const nearby = withDistance.filter(w => w.distance <= nearbyThreshold);

      if (nearby.length > 0) {
        nearby.sort((a, b) => a.distance - b.distance);
        return nearby[0].ticket;
      }
    }

    // Rule 2: Find the most prioritized level
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    notOverdue.sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 99;
      const pb = priorityOrder[b.priority] ?? 99;
      return pa - pb;
    });

    const target = notOverdue.length > 0 ? notOverdue : candidates;
    const highestPriority = priorityOrder[target[0].priority] ?? 99;
    const samePriority = target.filter(
      t => (priorityOrder[t.priority] ?? 99) === highestPriority
    );

    // Rule 3: Random ticket among same-priority tickets
    if (samePriority.length > 1) {
      return samePriority[Math.floor(Math.random() * samePriority.length)];
    }

    return samePriority[0];
  }

  async logPerformance(log: InsertPerformanceLog): Promise<PerformanceLog> {
    const [entry] = await db.insert(performanceLogs).values(log).returning();
    return entry;
  }

  async deletePerformanceLogsForTicket(ticketId: number): Promise<void> {
    await db.delete(performanceLogs).where(eq(performanceLogs.ticketId, ticketId));
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
      const assigneeList = assignees.map(a => ({ id: a.id, name: a.name }));
      for (const tech of assigneeList) {
        const tf = parseFloat(ticket.ticketFee || "0");
        const trp = parseFloat(ticket.transportFee || "0");
        const calculatedBonus = (tf + trp).toFixed(2);
        result.push({
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          ticketIdCustom: ticket.ticketIdCustom,
          title: ticket.title,
          type: ticket.type,
          customerName: ticket.customerName,
          performStatus: ticket.performStatus,
          closedAt: ticket.closedAt,
          technicianId: tech.id,
          technicianName: tech.name,
          ticketFee: ticket.ticketFee || "0",
          transportFee: ticket.transportFee || "0",
          bonus: calculatedBonus,
          assigneeCount: assigneeList.length,
          totalTicketCost: (parseFloat(calculatedBonus) * assigneeList.length).toFixed(2),
        });
      }
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
        totalTicketFee: sql<number>`coalesce(sum(${tickets.ticketFee}::numeric), 0)`,
        totalTransportFee: sql<number>`coalesce(sum(${tickets.transportFee}::numeric), 0)`,
      }).from(tickets).where(and(...bonusConditions));

      const totalCompleted = Number(stats.totalCompleted) || 0;
      const slaComplianceCount = Number(stats.slaComplianceCount) || 0;
      const totalTicketFee = Number(bonusResult.totalTicketFee) || 0;
      const totalTransportFee = Number(bonusResult.totalTransportFee) || 0;

      result.push({
        technicianId: tech.id,
        technicianName: tech.name,
        totalCompleted,
        slaComplianceRate: totalCompleted > 0 ? Math.round((slaComplianceCount / totalCompleted) * 100) : 100,
        avgResolutionMinutes: Math.round(Number(stats.avgResolutionMinutes) || 0),
        totalOverdue: Number(stats.totalOverdue) || 0,
        totalBonus: totalTicketFee + totalTransportFee,
        totalTicketFee,
        totalTransportFee,
      });
    }
    return result;
  }

  async getTechnicianBonusTotal(userId: number): Promise<{ totalBonus: number; ticketCount: number; totalTicketFee: number; totalTransportFee: number }> {
    const [result] = await db.select({
      totalTicketFee: sql<number>`coalesce(sum(${tickets.ticketFee}::numeric), 0)`,
      totalTransportFee: sql<number>`coalesce(sum(${tickets.transportFee}::numeric), 0)`,
      ticketCount: sql<number>`count(*)`,
    }).from(tickets)
      .innerJoin(ticketAssignments, eq(tickets.id, ticketAssignments.ticketId))
      .where(and(
        eq(ticketAssignments.userId, userId),
        eq(ticketAssignments.active, true),
        eq(tickets.status, TicketStatus.CLOSED)
      ));

    const totalTicketFee = Number(result.totalTicketFee) || 0;
    const totalTransportFee = Number(result.totalTransportFee) || 0;
    return {
      totalBonus: totalTicketFee + totalTransportFee,
      ticketCount: Number(result.ticketCount) || 0,
      totalTicketFee,
      totalTransportFee,
    };
  }

  async getDashboardStats(): Promise<{
    totalOpen: number;
    totalAssigned: number;
    totalClosed: number;
    slaBreachCount: number;
    pendingRejection: number;
  }> {
    const [stats] = await db.select({
      totalOpen: sql<number>`count(case when ${tickets.status} = ${TicketStatus.OPEN} then 1 end)`,
      totalAssigned: sql<number>`count(case when ${tickets.status} IN (${TicketStatus.ASSIGNED}, ${TicketStatus.IN_PROGRESS}) then 1 end)`,
      totalClosed: sql<number>`count(case when ${tickets.status} = ${TicketStatus.CLOSED} then 1 end)`,
      slaBreachCount: sql<number>`count(case when ${tickets.status} = ${TicketStatus.OVERDUE} OR (${tickets.slaDeadline} < NOW() AND ${tickets.status} != ${TicketStatus.CLOSED}) then 1 end)`,
      pendingRejection: sql<number>`count(case when ${tickets.status} = 'pending_rejection' then 1 end)`,
    }).from(tickets);
    
    return {
      totalOpen: Number(stats.totalOpen),
      totalAssigned: Number(stats.totalAssigned),
      totalClosed: Number(stats.totalClosed),
      slaBreachCount: Number(stats.slaBreachCount),
      pendingRejection: Number(stats.pendingRejection),
    };
  }
}

export const storage = new DatabaseStorage();

function parseGoogleMapsCoords(url: string | null | undefined): { lat: number; lng: number } | null {
  if (!url) return null;
  try {
    const patterns = [
      /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /place\/[^/]*\/(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /(-?\d+\.\d{4,}),\s*(-?\d+\.\d{4,})/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { lat, lng };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
