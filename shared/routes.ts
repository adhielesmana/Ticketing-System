import { z } from 'zod';
import { 
  insertUserSchema, 
  insertTicketSchema, 
  insertAssignmentSchema,
  users,
  tickets,
  ticketAssignments,
  performanceLogs,
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

// Filter schemas
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
      input: z.object({ userId: z.number().optional() }), // Optional for auto-assign
      responses: {
        200: z.custom<typeof tickets.$inferSelect>(),
        400: errorSchemas.validation,
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
        speedtestResult: z.string().optional(),
        closedNote: z.string().optional(),
        actionDescription: z.string().optional(),
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
