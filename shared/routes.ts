import { z } from 'zod';
import { 
  insertUserSchema, 
  insertTicketSchema, 
  insertAssignmentSchema,
  users,
  tickets,
  ticketAssignments,
  performanceLogs,
  settings,
  UserRoleValues,
  TicketStatusValues,
  TicketPriorityValues,
  TicketTypeValues
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
};

export const ticketFilterSchema = z.object({
  status: z.enum(TicketStatusValues as [string, ...string[]]).optional(),
  type: z.enum(TicketTypeValues as [string, ...string[]]).optional(),
  priority: z.enum(TicketPriorityValues as [string, ...string[]]).optional(),
  assignedTo: z.coerce.number().optional(),
  search: z.string().optional(),
});

export const api = {
  auth: {
    login: {
      method: 'POST' as const,
      path: '/api/auth/login' as const,
      input: z.object({
        username: z.string(),
        password: z.string(),
      }),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized,
      },
    },
    logout: {
      method: 'POST' as const,
      path: '/api/auth/logout' as const,
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
    me: {
      method: 'GET' as const,
      path: '/api/user' as const,
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized,
      },
    },
  },
  users: {
    list: {
      method: 'GET' as const,
      path: '/api/users' as const,
      input: z.object({
        role: z.enum(UserRoleValues as [string, ...string[]]).optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof users.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/users/:id' as const,
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/users' as const,
      input: insertUserSchema,
      responses: {
        201: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/users/:id' as const,
      input: insertUserSchema.partial(),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/users/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  tickets: {
    list: {
      method: 'GET' as const,
      path: '/api/tickets' as const,
      input: ticketFilterSchema.optional(),
      responses: {
        200: z.array(z.custom<typeof tickets.$inferSelect & { assignee?: typeof users.$inferSelect }>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/tickets/:id' as const,
      responses: {
        200: z.custom<typeof tickets.$inferSelect & { assignee?: typeof users.$inferSelect }>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/tickets' as const,
      input: insertTicketSchema,
      responses: {
        201: z.custom<typeof tickets.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/tickets/:id' as const,
      input: insertTicketSchema.partial(),
      responses: {
        200: z.custom<typeof tickets.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/tickets/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    assign: {
      method: 'POST' as const,
      path: '/api/tickets/:id/assign' as const,
      input: z.object({ userId: z.number().optional(), assignedAt: z.string().optional() }),
      responses: {
        200: z.custom<typeof tickets.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    autoAssign: {
      method: 'POST' as const,
      path: '/api/tickets/auto-assign' as const,
      responses: {
        200: z.custom<typeof tickets.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    start: {
      method: 'POST' as const,
      path: '/api/tickets/:id/start' as const,
      responses: {
        200: z.custom<typeof tickets.$inferSelect>(),
      },
    },
    close: {
      method: 'POST' as const,
      path: '/api/tickets/:id/close' as const,
      input: z.object({
        proofImageUrl: z.string().optional(),
        proofImageUrls: z.array(z.string()).optional(),
        speedtestResult: z.string().optional(),
        speedtestImageUrl: z.string().optional(),
        closedNote: z.string().optional(),
        actionDescription: z.string().optional(),
      }),
      responses: {
        200: z.custom<typeof tickets.$inferSelect>(),
      },
    },
    noResponse: {
      method: 'POST' as const,
      path: '/api/tickets/:id/no-response' as const,
      input: z.object({
        rejectionReason: z.string().min(1, "Reason is required"),
      }),
      responses: {
        200: z.custom<typeof tickets.$inferSelect>(),
      },
    },
    reject: {
      method: 'POST' as const,
      path: '/api/tickets/:id/reject' as const,
      input: z.object({
        reason: z.string().min(1, "Reason is required"),
      }),
      responses: {
        200: z.custom<typeof tickets.$inferSelect>(),
      },
    },
    cancelReject: {
      method: 'POST' as const,
      path: '/api/tickets/:id/cancel-reject' as const,
      responses: {
        200: z.custom<typeof tickets.$inferSelect>(),
      },
    },
    closeByHelpdesk: {
      method: 'POST' as const,
      path: '/api/tickets/:id/close-by-helpdesk' as const,
      input: z.object({
        reason: z.string().min(1, "Reason is required"),
      }),
      responses: {
        200: z.custom<typeof tickets.$inferSelect>(),
      },
    },
    reopen: {
      method: 'POST' as const,
      path: '/api/tickets/:id/reopen' as const,
      input: z.object({
        reason: z.string().min(1, "Reason is required"),
        technicianIds: z.array(z.number()).min(1).max(2),
      }),
      responses: {
        200: z.custom<typeof tickets.$inferSelect>(),
      },
    },
    reopenRejected: {
      method: 'POST' as const,
      path: '/api/tickets/:id/reopen-rejected' as const,
      input: z.object({
        reason: z.string().min(1, "Reason is required"),
        assignmentMode: z.enum(["current", "auto"]).default("current"),
      }),
      responses: {
        200: z.custom<typeof tickets.$inferSelect>(),
      },
    },
  },
  dashboard: {
    stats: {
      method: 'GET' as const,
      path: '/api/dashboard/stats' as const,
      responses: {
        200: z.object({
          totalOpen: z.number(),
          totalAssigned: z.number(),
          totalClosed: z.number(),
          slaBreachCount: z.number(),
          myActiveTickets: z.number().optional(),
        }),
      },
    },
  },
  performance: {
    me: {
      method: 'GET' as const,
      path: '/api/performance/me' as const,
      responses: {
        200: z.object({
          totalCompleted: z.number(),
          slaComplianceRate: z.number(),
          avgResolutionMinutes: z.number(),
          totalOverdue: z.number(),
        }),
      },
    },
  },
  reports: {
    tickets: {
      method: 'GET' as const,
      path: '/api/reports/tickets' as const,
      responses: {
        200: z.array(z.any()),
      },
    },
    bonusSummary: {
      method: 'GET' as const,
      path: '/api/reports/bonus-summary' as const,
      responses: {
        200: z.array(z.any()),
      },
    },
    performanceSummary: {
      method: 'GET' as const,
      path: '/api/reports/performance-summary' as const,
      responses: {
        200: z.array(z.any()),
      },
    },
    technicianPeriod: {
      method: 'GET' as const,
      path: '/api/reports/technician-period' as const,
      responses: {
        200: z.object({
          start: z.string(),
          end: z.string(),
          days: z.array(z.object({
            iso: z.string(),
            label: z.string(),
          })),
          dailyTarget: z.number(),
          monthlyTarget: z.number(),
          rows: z.array(z.object({
            technicianId: z.number(),
            technicianName: z.string(),
            dailyCounts: z.record(z.number()),
            total: z.number(),
            performancePercent: z.number(),
          })),
        }),
      },
    },
  },
  settings: {
    get: {
      method: 'GET' as const,
      path: '/api/settings/:key' as const,
      responses: {
        200: z.object({ key: z.string(), value: z.string().nullable() }),
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/settings' as const,
      responses: {
        200: z.array(z.object({ key: z.string(), value: z.string().nullable() })),
      },
    },
    set: {
      method: 'PUT' as const,
      path: '/api/settings' as const,
      input: z.object({
        key: z.string(),
        value: z.string().nullable(),
      }),
      responses: {
        200: z.object({ key: z.string(), value: z.string().nullable() }),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
