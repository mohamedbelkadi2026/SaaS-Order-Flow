import type { Express, Request, Response } from "express";
import { pool } from "./db";

const ALLOWED_OUTCOMES = new Set([
  "tentative", "repondu", "pas_de_reponse", "occupe", "rappel", "confirme", "annule"
]);

export function registerCallLogRoutes(app: Express) {
  app.get("/api/orders/:id/calls", async (req: Request, res: Response) => {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ message: "Non authentifié" });
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) return res.status(400).json({ message: "Commande invalide" });
    const user: any = req.user;
    try {
      const orderResult = await pool.query(
        "SELECT id, store_id, order_number, customer_name, customer_phone FROM orders WHERE id=$1 LIMIT 1",
        [orderId]
      );
      const order = orderResult.rows[0];
      if (!order) return res.status(404).json({ message: "Commande introuvable" });
      if (!user.isSuperAdmin && Number(user.storeId) !== Number(order.store_id)) {
        return res.status(403).json({ message: "Accès refusé" });
      }
      const result = await pool.query(
        `SELECT c.id, c.order_id AS "orderId", c.agent_id AS "agentId",
                COALESCE(u.username, u.email, 'Agent') AS "agentName",
                c.outcome, c.note, c.called_at AS "calledAt"
         FROM order_call_logs c
         LEFT JOIN users u ON u.id = c.agent_id
         WHERE c.order_id=$1 AND c.store_id=$2
         ORDER BY c.called_at DESC, c.id DESC`,
        [orderId, order.store_id]
      );
      res.json({ order: {
        id: order.id, orderNumber: order.order_number,
        customerName: order.customer_name, customerPhone: order.customer_phone
      }, attempts: result.rows, count: result.rows.length });
    } catch (err) {
      console.error("[CALL-LOG] GET failed:", err);
      res.status(500).json({ message: "Impossible de charger l'historique des appels" });
    }
  });

  app.post("/api/orders/:id/calls", async (req: Request, res: Response) => {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ message: "Non authentifié" });
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) return res.status(400).json({ message: "Commande invalide" });
    const user: any = req.user;
    const outcome = String(req.body?.outcome || "tentative");
    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 500) : null;
    if (!ALLOWED_OUTCOMES.has(outcome)) return res.status(400).json({ message: "Résultat d'appel invalide" });
    try {
      const orderResult = await pool.query(
        "SELECT id, store_id FROM orders WHERE id=$1 LIMIT 1",
        [orderId]
      );
      const order = orderResult.rows[0];
      if (!order) return res.status(404).json({ message: "Commande introuvable" });
      if (!user.isSuperAdmin && Number(user.storeId) !== Number(order.store_id)) {
        return res.status(403).json({ message: "Accès refusé" });
      }
      const inserted = await pool.query(
        `INSERT INTO order_call_logs (order_id, store_id, agent_id, outcome, note, called_at)
         VALUES ($1,$2,$3,$4,$5,NOW())
         RETURNING id, order_id AS "orderId", agent_id AS "agentId", outcome, note, called_at AS "calledAt"`,
        [orderId, order.store_id, user.id, outcome, note]
      );
      res.status(201).json(inserted.rows[0]);
    } catch (err) {
      console.error("[CALL-LOG] POST failed:", err);
      res.status(500).json({ message: "Impossible d'enregistrer l'appel" });
    }
  });
}
