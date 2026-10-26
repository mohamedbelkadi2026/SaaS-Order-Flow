import type { Express, RequestHandler } from "express";
import { db } from "./db";
import { storage } from "./storage";
import type { User } from "@shared/schema";
import { sql } from "drizzle-orm";
import { moroccoToday } from "@shared/morocco-time";

export async function readTeamActivity(database: typeof db, storeId: number, day: string, magasinId: number | null, agentIds?: number[]) {
  const scope = sql`o.store_id = ${storeId} ${magasinId == null ? sql`` : sql`AND o.magasin_id = ${magasinId}`}`;
  const assignmentScope = agentIds === undefined ? sql`` : agentIds.length ? sql`AND o.assigned_to_id IN (${sql.join(agentIds.map(id => sql`${id}`), sql`, `)})` : sql`AND false`;
  const actorScope = agentIds === undefined ? sql`` : agentIds.length ? sql`AND l.agent_id IN (${sql.join(agentIds.map(id => sql`${id}`), sql`, `)})` : sql`AND false`;
  const [pool, activity] = await Promise.all([
    database.execute(sql`SELECT o.assigned_to_id AS "agentId", count(*)::int AS total,
      count(*) FILTER (WHERE o.status = 'nouveau')::int AS nouveaux
      FROM orders o WHERE ${scope} ${assignmentScope} GROUP BY o.assigned_to_id`),
    database.execute(sql`WITH first_confirmation AS (
      SELECT DISTINCT ON (l.order_id) l.order_id, l.agent_id
      FROM order_follow_up_logs l JOIN orders o ON o.id = l.order_id
      WHERE ${scope} AND l.agent_id IS NOT NULL
        AND l.created_at >= (${day}::date::timestamp AT TIME ZONE 'Africa/Casablanca') AT TIME ZONE 'UTC'
        AND l.created_at < ((${day}::date + 1)::timestamp AT TIME ZONE 'Africa/Casablanca') AT TIME ZONE 'UTC'
        AND l.note ~ '^Statut: "[^"]*" → "(confirme|confirme_reporte)"$'
        AND l.note !~ '^Statut: "(confirme|confirme_reporte)"'
      ORDER BY l.order_id, l.created_at, l.id
    ) SELECT l.agent_id AS "agentId", count(*)::int AS "confirmedToday"
      FROM first_confirmation l WHERE true ${actorScope} GROUP BY l.agent_id`),
  ]);
  return { pool: pool.rows, activity: activity.rows };
}

export function registerTeamPerformanceRoutes(app: Express, requireAuth: RequestHandler) {
  app.get('/api/agents/performance-split', requireAuth, async (req, res) => {
    const user = req.user! as User;
    if (!user.storeId || user.role === 'media_buyer') return res.status(403).json({message:'Accès refusé'});
    const day = String(req.query.date || moroccoToday());
    const magasinId = req.query.magasinId && req.query.magasinId !== 'all' ? Number(req.query.magasinId) : null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(new Date(day).getTime()) || (magasinId !== null && (!Number.isInteger(magasinId) || magasinId <= 0))) return res.status(400).json({message:'Filtre invalide'});
    const scope = user.role === 'agent' ? await storage.getVisibleAgentIds(user) : undefined;
    const ids = scope === undefined ? undefined : Array.isArray(scope) ? scope : [scope];
    const [current, delivery, facts] = await Promise.all([
      storage.getAgentPerformanceByAssignment(user.storeId, {magasinId}),
      storage.getAgentPerformanceByAssignment(user.storeId, {magasinId, dateFrom:day, dateTo:day}),
      readTeamActivity(db, user.storeId, day, magasinId, ids),
    ]);
    res.setHeader('Cache-Control','no-store');
    res.json({ current: current.filter(row => !ids || ids.includes(row.agentId)).map(row => ({...row,
      nouveaux: Number(facts.pool.find(p => p.agentId === row.agentId)?.nouveaux ?? 0),
    })), delivery: delivery.filter(row => !ids || ids.includes(row.agentId)), ...facts });
  });
}
