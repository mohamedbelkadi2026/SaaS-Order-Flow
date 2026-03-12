import { z } from 'zod';

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  notFound: z.object({ message: z.string() }),
  internal: z.object({ message: z.string() }),
};

export const api = {
  stats: {
    get: {
      method: 'GET' as const,
      path: '/api/stats' as const,
      responses: {
        200: z.object({
          totalOrders: z.number(),
          newOrders: z.number(),
          confirmed: z.number(),
          inProgress: z.number(),
          cancelled: z.number(),
          delivered: z.number(),
          refused: z.number(),
          revenue: z.number(),
          profit: z.number(),
          confirmationRate: z.number(),
        }),
      }
    }
  },
  orders: {
    list: {
      method: 'GET' as const,
      path: '/api/orders' as const,
      responses: {
        200: z.array(z.custom<any>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/orders/:id' as const,
      responses: {
        200: z.custom<any>(),
        404: errorSchemas.notFound,
      },
    },
    updateStatus: {
      method: 'PATCH' as const,
      path: '/api/orders/:id/status' as const,
      input: z.object({ status: z.string() }),
      responses: {
        200: z.custom<any>(),
        404: errorSchemas.notFound,
      },
    },
    assign: {
      method: 'PATCH' as const,
      path: '/api/orders/:id/assign' as const,
      input: z.object({ agentId: z.number().nullable() }),
      responses: {
        200: z.custom<any>(),
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
      path: '/api/products' as const,
      responses: {
        200: z.array(z.custom<any>()),
      },
    },
  },
  agents: {
    list: {
      method: 'GET' as const,
      path: '/api/agents' as const,
      responses: {
        200: z.array(z.custom<any>()),
      }
    },
    create: {
      method: 'POST' as const,
      path: '/api/agents' as const,
      input: z.object({
        username: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        password: z.string().min(4),
        paymentType: z.string().optional(),
        paymentAmount: z.number().optional(),
        distributionMethod: z.string().optional(),
        isActive: z.number().optional(),
        role: z.enum(['agent', 'media_buyer']).optional(),
        buyerCode: z.string().optional(),
      }),
      responses: {
        201: z.custom<any>(),
      }
    }
  },
  adSpend: {
    list: {
      method: 'GET' as const,
      path: '/api/ad-spend' as const,
      responses: {
        200: z.array(z.custom<any>()),
      }
    },
    upsert: {
      method: 'POST' as const,
      path: '/api/ad-spend' as const,
      input: z.object({
        productId: z.number().nullable().optional(),
        date: z.string(),
        amount: z.number(),
      }),
      responses: {
        200: z.custom<any>(),
      }
    }
  },
  integrations: {
    list: {
      method: 'GET' as const,
      path: '/api/integrations' as const,
    },
    create: {
      method: 'POST' as const,
      path: '/api/integrations' as const,
      input: z.object({
        provider: z.string().min(1),
        type: z.enum(["store", "shipping"]),
        credentials: z.record(z.string()).default({}),
      }),
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/integrations/:id' as const,
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/integrations/:id' as const,
    },
    logs: {
      method: 'GET' as const,
      path: '/api/integration-logs' as const,
    },
    webhook: {
      method: 'POST' as const,
      path: '/api/integrations/webhook/:provider' as const,
    },
    ship: {
      method: 'POST' as const,
      path: '/api/orders/:id/ship' as const,
      input: z.object({ provider: z.string().min(1) }),
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
