import { db } from "./db";
import { 
  users, tickets, ticketAssignments, performanceLogs, settings, technicianFees, mapTiles,
  type User, type InsertUser, 
  type Ticket, type InsertTicket,
  type TicketAssignment, type InsertAssignment,
  type PerformanceLog, type InsertPerformanceLog,
  type Setting, type InsertSetting,
  type TechnicianFee, type InsertTechnicianFee,
  type TechnicianPerformance,
  TicketStatus,
  UserRole,
  TicketType,
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

  getTechnicianFees(technicianId: number): Promise<TechnicianFee[]>;
  setTechnicianFee(technicianId: number, ticketType: string, ticketFee: string, transportFee: string): Promise<TechnicianFee>;
  getTechnicianFeeForType(technicianId: number, ticketType: string): Promise<TechnicianFee | undefined>;
  getAllTechnicianFees(): Promise<TechnicianFee[]>;

  getSetting(key: string): Promise<Setting | undefined>;
  setSetting(key: string, value: string | null): Promise<Setting>;
  getAllSettings(): Promise<Setting[]>;
  bulkResetStaleAssignments(maxAgeHours?: number): Promise<number>;

  getTicketsReport(
    filters?: { dateFrom?: string; dateTo?: string; type?: string; status?: string },
    pagination?: { skip?: number; take?: number },
  ): Promise<{ tickets: any[]; total: number }>;
  getBonusSummary(filters?: { dateFrom?: string; dateTo?: string }): Promise<any[]>;
  getPerformanceSummary(filters?: { dateFrom?: string; dateTo?: string }): Promise<any[]>;
  getTechnicianBonusTotal(userId: number): Promise<{ totalBonus: number; ticketCount: number; totalTicketFee: number; totalTransportFee: number }>;
  getTechnicianDailyPerformance(start: Date, end: Date): Promise<Array<{ technicianId: number; technicianName: string; day: string; solved: number }>>;

  getDashboardStats(): Promise<{
    totalOpen: number;
    totalAssigned: number;
    totalClosed: number;
    slaBreachCount: number;
    pendingRejection: number;
  }>;
  getCachedTile(z: number, x: number, y: number): Promise<{ tileData: Buffer; contentType: string } | undefined>;
  saveCachedTile(tile: { z: number; x: number; y: number; tileData: Buffer; contentType: string }): Promise<void>;
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
    const assignedRaw = filters?.assignedTo ?? filters?.assigned_to;
    const assignedTo = assignedRaw !== undefined && assignedRaw !== null ? Number(assignedRaw) : undefined;
    const hasAssignedFilter = typeof assignedTo === "number" && !Number.isNaN(assignedTo);

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

    let query: any = db.select().from(tickets);
    if (hasAssignedFilter) {
      query = db
        .select({ ticket: tickets })
        .from(tickets)
        .innerJoin(ticketAssignments, eq(ticketAssignments.ticketId, tickets.id))
        .where(and(
          eq(ticketAssignments.userId, assignedTo!),
          eq(ticketAssignments.active, true)
        ));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const rows = await query.orderBy(desc(tickets.createdAt));
    if (hasAssignedFilter) {
      return rows.map((row: any) => row.ticket);
    }
    return rows;
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
    forceHomeMaintenance?: boolean;
  }): Promise<Ticket | undefined> {
    const { isBackboneSpecialist, preferredType, lastTicketLocation, forceHomeMaintenance = false } = options;

    // Backbone specialists only get backbone_maintenance tickets
    if (isBackboneSpecialist) {
      const candidates = await db.select().from(tickets)
        .where(and(eq(tickets.status, TicketStatus.OPEN), eq(tickets.type, "backbone_maintenance")))
        .orderBy(asc(tickets.createdAt));
      if (candidates.length === 0) return undefined;
      return this.pickBestCandidate(candidates, lastTicketLocation);
    }

    // Non-backbone: first check for overdue tickets across ALL eligible types
    const now = new Date();
    const allEligible = await db.select().from(tickets)
      .where(and(
        eq(tickets.status, TicketStatus.OPEN),
        sql`${tickets.type} != 'backbone_maintenance'`
      ))
      .orderBy(asc(tickets.createdAt));

    if (forceHomeMaintenance) {
      const homeCandidates = allEligible.filter(t => t.type === "home_maintenance");
      if (homeCandidates.length > 0) {
        return this.pickBestCandidate(homeCandidates, lastTicketLocation);
      }
    }

    const overdueTickets = allEligible.filter(t => t.slaDeadline && new Date(t.slaDeadline) < now);
    if (overdueTickets.length > 0) {
      overdueTickets.sort((a, b) => new Date(a.slaDeadline).getTime() - new Date(b.slaDeadline).getTime());
      return overdueTickets[0];
    }

    // No overdue tickets — apply type preference with 4:2 ratio
    const preferredCondition = preferredType === "installation"
      ? and(eq(tickets.status, TicketStatus.OPEN), eq(tickets.type, "installation"))
      : and(eq(tickets.status, TicketStatus.OPEN), eq(tickets.type, "home_maintenance"));

    const fallbackCondition = preferredType === "installation"
      ? and(eq(tickets.status, TicketStatus.OPEN), eq(tickets.type, "home_maintenance"))
      : and(eq(tickets.status, TicketStatus.OPEN), eq(tickets.type, "installation"));

    let candidates = await db.select().from(tickets)
      .where(preferredCondition)
      .orderBy(asc(tickets.createdAt));

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
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

    const overdue = candidates
      .filter(t => t.slaDeadline && new Date(t.slaDeadline) < now)
      .sort((a, b) => new Date(a.slaDeadline).getTime() - new Date(b.slaDeadline).getTime());
    const nonOverdue = candidates.filter(t => !t.slaDeadline || new Date(t.slaDeadline) >= now);

    // --- STEP 1: Overdue tickets ALWAYS get absolute priority (no matter what) ---
    // Most overdue first (earliest SLA deadline), regardless of distance
    if (overdue.length > 0) return overdue[0];

    // --- From here, all candidates are non-overdue ---
    const lastCoords = lastTicketLocation ? parseGoogleMapsCoords(lastTicketLocation) : null;

    // --- STEP 2: First ticket of the day (no last location) ---
    // Pick the oldest ticket
    if (!lastCoords) {
      nonOverdue.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return nonOverdue[0] || candidates[0];
    }

    // --- STEP 3: Has last location — proximity-based selection (2km) ---
    const proximityThreshold = 2; // km

    const computeDistance = (t: Ticket): number => {
      const coords = parseGoogleMapsCoords(t.customerLocationUrl);
      return coords ? haversineDistance(lastCoords.lat, lastCoords.lng, coords.lat, coords.lng) : Infinity;
    };

    // 3a: Oldest non-overdue tickets within 2km
    const nearby = nonOverdue
      .filter(t => computeDistance(t) <= proximityThreshold)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    if (nearby.length > 0) return nearby[0];

    // --- STEP 4: Priority level + oldest in any condition (beyond 2km) ---
    nonOverdue.sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 99;
      const pb = priorityOrder[b.priority] ?? 99;
      if (pa !== pb) return pa - pb;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    return nonOverdue[0] || candidates[0];
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

  async getTechnicianFees(technicianId: number): Promise<TechnicianFee[]> {
    return await db.select().from(technicianFees).where(eq(technicianFees.technicianId, technicianId));
  }

  async getTechnicianFeeForType(technicianId: number, ticketType: string): Promise<TechnicianFee | undefined> {
    const [fee] = await db.select().from(technicianFees)
      .where(and(eq(technicianFees.technicianId, technicianId), eq(technicianFees.ticketType, ticketType)));
    return fee;
  }

  async setTechnicianFee(technicianId: number, ticketType: string, ticketFee: string, transportFee: string): Promise<TechnicianFee> {
    const existing = await this.getTechnicianFeeForType(technicianId, ticketType);
    if (existing) {
      const [updated] = await db.update(technicianFees)
        .set({ ticketFee, transportFee })
        .where(eq(technicianFees.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(technicianFees)
      .values({ technicianId, ticketType, ticketFee, transportFee })
      .returning();
    return created;
  }

  async getAllTechnicianFees(): Promise<TechnicianFee[]> {
    return await db.select().from(technicianFees);
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

  async bulkResetStaleAssignments(maxAgeHours: number = 24): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    const staleAssignments = await db.select({
      ticketId: ticketAssignments.ticketId,
    }).from(ticketAssignments)
      .innerJoin(tickets, eq(tickets.id, ticketAssignments.ticketId))
      .where(and(
        eq(ticketAssignments.active, true),
        or(
          eq(tickets.status, TicketStatus.ASSIGNED),
          eq(tickets.status, TicketStatus.WAITING_ASSIGNMENT)
        ),
        or(
          eq(tickets.type, TicketType.HOME_MAINTENANCE),
          eq(tickets.type, TicketType.INSTALLATION)
        ),
        sql`${ticketAssignments.assignedAt} < ${cutoff}`
      ));

    const ticketIdSet = new Set(staleAssignments.map(a => a.ticketId));
    const uniqueTicketIds = Array.from(ticketIdSet);
    let count = 0;
    for (const ticketId of uniqueTicketIds) {
      await db.update(ticketAssignments)
        .set({ active: false })
        .where(and(eq(ticketAssignments.ticketId, ticketId), eq(ticketAssignments.active, true)));
      await db.update(tickets)
        .set({ status: TicketStatus.OPEN })
        .where(eq(tickets.id, ticketId));
      count++;
    }
    return count;
  }

  async getTicketsReport(
    filters: { dateFrom?: string; dateTo?: string; type?: string; status?: string } = {},
    pagination: { skip?: number; take?: number } = {},
  ): Promise<{ tickets: any[]; total: number }> {
    let baseQuery = db.select().from(tickets);
    const conditions = [];

    if (filters.type) conditions.push(eq(tickets.type, filters.type));
    if (filters.status) conditions.push(eq(tickets.status, filters.status));
    if (filters.dateFrom) conditions.push(sql`${tickets.createdAt} >= ${filters.dateFrom}::timestamp`);
    if (filters.dateTo) conditions.push(sql`${tickets.createdAt} <= ${filters.dateTo}::timestamp + interval '1 day'`);

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let totalQuery = db.select({
      total: sql<number>`count(*)`,
    }).from(tickets);
    if (whereClause) {
      totalQuery = totalQuery.where(whereClause);
    }
    const [totalResult] = await totalQuery;
    const total = totalResult?.total || 0;

    if (whereClause) {
      baseQuery = baseQuery.where(whereClause);
    }

    baseQuery = baseQuery.orderBy(desc(tickets.createdAt));
    if (typeof pagination.skip === "number") {
      baseQuery = baseQuery.offset(pagination.skip);
    }
    if (typeof pagination.take === "number") {
      baseQuery = baseQuery.limit(pagination.take);
    }

    const ticketRows = await baseQuery;
    const result: any[] = [];
    for (const ticket of ticketRows) {
      const assignees = await this.getAssigneesForTicket(ticket.id);
      result.push({
        ...ticket,
        assignees: assignees.map(a => ({ id: a.id, name: a.name })),
      });
    }
    return { tickets: result, total };
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

      const perfLogs = await db.select().from(performanceLogs)
        .where(eq(performanceLogs.ticketId, ticket.id));

      for (const tech of assigneeList) {
        const perfLog = perfLogs.find(p => p.userId === tech.id);
        const tf = perfLog?.ticketFee ? parseFloat(perfLog.ticketFee) : parseFloat(ticket.ticketFee || "0");
        const trp = perfLog?.transportFee ? parseFloat(perfLog.transportFee) : parseFloat(ticket.transportFee || "0");
        const calculatedBonus = perfLog?.bonus ? perfLog.bonus : (tf + trp).toFixed(2);
        
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
          ticketFee: perfLog?.ticketFee || ticket.ticketFee || "0",
          transportFee: perfLog?.transportFee || ticket.transportFee || "0",
          bonus: calculatedBonus,
          assigneeCount: assigneeList.length,
          totalTicketCost: "0",
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

  async getTechnicianDailyPerformance(start: Date, end: Date): Promise<Array<{ technicianId: number; technicianName: string; day: string; solved: number }>> {
    const rows = await db.select({
      technicianId: performanceLogs.userId,
      technicianName: users.name,
      day: sql<string>`to_char(${tickets.closedAt}, 'YYYY-MM-DD')`,
      solved: sql<number>`count(distinct ${performanceLogs.ticketId})`,
    })
      .from(performanceLogs)
      .innerJoin(tickets, eq(tickets.id, performanceLogs.ticketId))
      .innerJoin(users, eq(users.id, performanceLogs.userId))
      .where(and(
        eq(users.role, UserRole.TECHNICIAN),
        eq(tickets.status, TicketStatus.CLOSED),
        sql`${tickets.closedAt} >= ${start}`,
        sql`${tickets.closedAt} <= ${end}`,
      ))
      .groupBy(performanceLogs.userId, users.name, sql`to_char(${tickets.closedAt}, 'YYYY-MM-DD')`)
      .orderBy(users.name, sql<string>`to_char(${tickets.closedAt}, 'YYYY-MM-DD')`);

    return rows.map(r => ({
      technicianId: r.technicianId,
      technicianName: r.technicianName,
      day: r.day,
      solved: Number(r.solved) || 0,
    }));
  }

  async getTechnicianBonusTotal(userId: number): Promise<{ totalBonus: number; ticketCount: number; totalTicketFee: number; totalTransportFee: number }> {
    const [perfResult] = await db.select({
      totalTicketFee: sql<number>`coalesce(sum(${performanceLogs.ticketFee}::numeric), 0)`,
      totalTransportFee: sql<number>`coalesce(sum(${performanceLogs.transportFee}::numeric), 0)`,
      totalBonus: sql<number>`coalesce(sum(${performanceLogs.bonus}::numeric), 0)`,
      ticketCount: sql<number>`count(*)`,
    }).from(performanceLogs)
      .where(eq(performanceLogs.userId, userId));

    const hasPerfData = Number(perfResult.totalBonus) > 0;

    if (hasPerfData) {
      return {
        totalBonus: Number(perfResult.totalBonus) || 0,
        ticketCount: Number(perfResult.ticketCount) || 0,
        totalTicketFee: Number(perfResult.totalTicketFee) || 0,
        totalTransportFee: Number(perfResult.totalTransportFee) || 0,
      };
    }

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

  async getCachedTile(z: number, x: number, y: number): Promise<{ tileData: Buffer; contentType: string } | undefined> {
    const [tile] = await db.select({
      tileData: mapTiles.tileData,
      contentType: mapTiles.contentType,
    }).from(mapTiles)
      .where(and(eq(mapTiles.z, z), eq(mapTiles.x, x), eq(mapTiles.y, y)));
    if (!tile) return undefined;
    return {
      tileData: Buffer.from(tile.tileData, "base64"),
      contentType: tile.contentType,
    };
  }

  async saveCachedTile(tile: { z: number; x: number; y: number; tileData: Buffer; contentType: string }): Promise<void> {
    const encoded = tile.tileData.toString("base64");
    await db.insert(mapTiles)
      .values({
        z: tile.z,
        x: tile.x,
        y: tile.y,
        tileData: encoded,
        contentType: tile.contentType,
      })
      .onConflictDoUpdate({
        target: [mapTiles.z, mapTiles.x, mapTiles.y],
        set: {
          tileData: encoded,
          contentType: tile.contentType,
          updatedAt: new Date(),
        },
      });
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
      slaBreachCount: sql<number>`count(case when ${tickets.slaDeadline} < NOW() AND ${tickets.status} NOT IN (${TicketStatus.CLOSED}, 'rejected') then 1 end)`,
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
