import { z } from 'zod';
import { orders, products, users, stores, orderItems } from './schema';

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  notFound: z.object({ message: z.string() }),
  internal: z.object({ message: z.string() }),
};

export const api = {
  stats: {
    get: {
      method: 'GET' as const,
      path: '/api/stores/:storeId/stats' as const,
      responses: {
        200: z.object({
          totalOrders: z.number(),
          confirmed: z.number(),
          inProgress: z.number(),
          cancelled: z.number(),
          delivered: z.number(),
          refused: z.number(),
          revenue: z.number(),
          profit: z.number(),
        }),
      }
    }
  },
  orders: {
    list: {
      method: 'GET' as const,
      path: '/api/stores/:storeId/orders' as const,
      responses: {
        200: z.array(z.custom<any>()), // array of OrderWithDetails
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/orders/:id' as const,
      responses: {
        200: z.custom<any>(), // OrderWithDetails
        404: errorSchemas.notFound,
      },
    },
    updateStatus: {
      method: 'PATCH' as const,
      path: '/api/orders/:id/status' as const,
      input: z.object({ status: z.string() }),
      responses: {
        200: z.custom<typeof orders.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    assign: {
      method: 'PATCH' as const,
      path: '/api/orders/:id/assign' as const,
      input: z.object({ agentId: z.number().nullable() }),
      responses: {
        200: z.custom<typeof orders.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    shopifyWebhook: {
      method: 'POST' as const,
      path: '/api/webhooks/shopify' as const,
      input: z.any(),
      responses: {
        200: z.object({ success: z.boolean() }),
      }
    }
  },
  products: {
    list: {
      method: 'GET' as const,
      path: '/api/stores/:storeId/products' as const,
      responses: {
        200: z.array(z.custom<typeof products.$inferSelect>()),
      },
    },
  },
  agents: {
    list: {
      method: 'GET' as const,
      path: '/api/stores/:storeId/agents' as const,
      responses: {
        200: z.array(z.custom<typeof users.$inferSelect>()),
      }
    }
  }
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
