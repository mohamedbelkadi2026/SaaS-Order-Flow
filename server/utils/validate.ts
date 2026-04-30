import type { Request, Response, NextFunction } from "express";
import type { z } from "zod";

/**
 * Express middleware that validates `req.body` against a Zod schema.
 * On success, replaces `req.body` with the parsed (typed + sanitized) value
 * — strips unknown fields automatically, which is the core of the
 * mass-assignment defence (no privilege-escalation via injected fields).
 *
 * On failure, returns 400 with a French message + flattened errors object
 * for clients that want to highlight specific fields.
 *
 * Usage:
 *   const updateUserSchema = z.object({ username: z.string().min(2) });
 *   app.put("/api/users/:id", requireAuth, validateBody(updateUserSchema), (req, res) => {
 *     // req.body is now { username: string } — typed and safe.
 *   });
 */
export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        message: result.error.errors[0]?.message || "Données invalides",
        errors: result.error.flatten(),
      });
    }
    req.body = result.data;
    next();
  };
}

/**
 * Permission helper: ensures the caller can act on the given store.
 * Super admins bypass the check. Regular users must belong to the store.
 *
 * Usage:
 *   const storeId = Number(req.params.storeId);
 *   await requireStoreOwnership(storeId)(req, res, next);
 */
export function requireStoreOwnership(storeId: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Non authentifié" });
    }
    const u = req.user as any;
    if (u.isSuperAdmin) return next();
    if (u.storeId === storeId) return next();
    return res.status(403).json({ message: "Magasin non autorisé" });
  };
}
