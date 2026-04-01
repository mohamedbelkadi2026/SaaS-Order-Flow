import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User } from "@shared/schema";
import { pool } from "./db";
import connectPgSimple from "connect-pg-simple";
import { generateOTP, sendVerificationEmail } from "./services/email";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  const buf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(Buffer.from(hashed, "hex"), buf);
}

declare global {
  namespace Express {
    interface User extends import("@shared/schema").User {}
  }
}

export async function ensureSessionTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid"    varchar   NOT NULL COLLATE "default",
        "sess"   json      NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")
    `);
    console.log("[Session] session table verified / created ✓");
  } catch (err: any) {
    console.error("[Session] ⚠️  Could not create session table:", err.message);
  }
}

export function setupAuth(app: Express) {
  const PgSession = connectPgSimple(session);

  // SESSION_SECRET is required for secure cookies. If missing, generate a
  // random one and warn loudly — sessions won't persist across restarts.
  const sessionSecret = process.env.SESSION_SECRET ?? (() => {
    const fallback = randomBytes(32).toString("hex");
    console.error(
      "[Auth] ⚠️  SESSION_SECRET is not set! Using a random secret — " +
      "all sessions will be invalidated on restart. " +
      "Set SESSION_SECRET in Railway → Variables."
    );
    return fallback;
  })();

  const isProduction = process.env.NODE_ENV === "production";

  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new PgSession({
      pool: pool,
      tableName: "session",
      createTableIfMissing: true,
    }),
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
    },
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: "email" },
      async (email, password, done) => {
        try {
          const user = await storage.getUserByEmail(email);
          if (!user) return done(null, false, { message: "Email incorrect" });
          if (!user.password) return done(null, false, { message: "Mot de passe non configuré" });
          const valid = await comparePasswords(password, user.password);
          if (!valid) return done(null, false, { message: "Mot de passe incorrect" });
          if (user.isActive === 0 && !user.isSuperAdmin) return done(null, false, { message: "Votre compte est suspendu. Veuillez contacter l'administration." });
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUserById(id);
      done(null, user || undefined);
    } catch (err) {
      done(err);
    }
  });

  app.post("/api/auth/signup", async (req, res, next) => {
    try {
      const { storeName, username, email, password } = req.body;

      if (!storeName || !username || !email || !password) {
        return res.status(400).json({ message: "Tous les champs sont requis" });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Cet email est déjà utilisé" });
      }

      const hashedPassword = await hashPassword(password);
      const store = await storage.createStore({ name: storeName });
      const user = await storage.createUser({
        username,
        email,
        password: hashedPassword,
        role: "owner",
        storeId: store.id,
        isEmailVerified: 0,
      });

      await storage.createSubscription({
        storeId: store.id,
        plan: 'trial',
        monthlyLimit: 60,
        pricePerMonth: 0,
        currentMonthOrders: 0,
        isActive: 1,
      });

      // Generate and send OTP
      const otp = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      await storage.createVerificationCode(user.id, otp, expiresAt);
      if (email) {
        sendVerificationEmail(email, otp).catch(e => console.error("[Email] Failed:", e));
      }

      req.login(user, (err) => {
        if (err) return next(err);
        const { password: _, ...safeUser } = user;
        return res.status(201).json({ ...safeUser, needsVerification: true });
      });
    } catch (err) {
      console.error("Signup error:", err);
      return res.status(500).json({ message: "Erreur lors de l'inscription" });
    }
  });

  /* ── Resend OTP ─────────────────────────────────────────────── */
  app.post("/api/auth/send-verification", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Non authentifié" });
      const user = req.user!;
      if (user.isEmailVerified) return res.json({ message: "Email déjà vérifié" });
      if (!user.email) return res.status(400).json({ message: "Pas d'email associé à ce compte" });

      const otp = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await storage.createVerificationCode(user.id, otp, expiresAt);
      sendVerificationEmail(user.email, otp).catch(e => console.error("[Email] Failed:", e));

      return res.json({ message: "Code envoyé" });
    } catch (err) {
      console.error("send-verification error:", err);
      return res.status(500).json({ message: "Erreur serveur" });
    }
  });

  /* ── Verify OTP ─────────────────────────────────────────────── */
  app.post("/api/auth/verify-email", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Non authentifié" });
      const user = req.user!;
      const { code } = req.body;

      if (!code || typeof code !== "string") {
        return res.status(400).json({ message: "Code invalide" });
      }

      if (user.isEmailVerified) {
        return res.json({ success: true, message: "Email déjà vérifié" });
      }

      const record = await storage.getVerificationCode(user.id);
      if (!record) {
        return res.status(400).json({ message: "Aucun code trouvé. Veuillez en demander un nouveau." });
      }
      if (new Date() > record.expiresAt) {
        await storage.deleteVerificationCode(user.id);
        return res.status(400).json({ message: "Code expiré. Veuillez en demander un nouveau." });
      }
      if (code.trim() !== record.code) {
        return res.status(400).json({ message: "Code incorrect." });
      }

      await storage.updateUser(user.id, { isEmailVerified: 1 });
      await storage.deleteVerificationCode(user.id);

      // Refresh session user
      const updatedUser = await storage.getUserById(user.id);
      if (updatedUser) {
        await new Promise<void>((resolve, reject) => {
          req.login(updatedUser, (err) => (err ? reject(err) : resolve()));
        });
      }

      return res.json({ success: true, message: "Email vérifié avec succès !" });
    } catch (err) {
      console.error("verify-email error:", err);
      return res.status(500).json({ message: "Erreur serveur" });
    }
  });

  /* ── Debug: Get latest OTP for an email (super-admin only) ─────── */
  app.get("/api/auth/debug-otp", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Non authentifié" });
      if (!req.user!.isSuperAdmin) return res.status(403).json({ message: "Super admin requis" });

      const targetEmail = (req.query.email as string)?.trim() || req.user!.email;
      if (!targetEmail) return res.status(400).json({ message: "Email requis" });

      const targetUser = await storage.getUserByEmail(targetEmail);
      if (!targetUser) return res.status(404).json({ message: "Utilisateur introuvable", email: targetEmail });

      const record = await storage.getVerificationCode(targetUser.id);
      if (!record) {
        return res.json({ found: false, message: "Aucun code actif pour cet utilisateur.", email: targetEmail });
      }

      const isExpired = new Date() > record.expiresAt;
      const secondsLeft = Math.max(0, Math.round((record.expiresAt.getTime() - Date.now()) / 1000));
      console.log(`[DEBUG-OTP] Super admin ${req.user!.email} queried code for ${targetEmail}: ${record.code}`);

      return res.json({
        found: true,
        email: targetEmail,
        code: record.code,
        expiresAt: record.expiresAt,
        isExpired,
        secondsLeft,
      });
    } catch (err: any) {
      console.error("[DEBUG-OTP] Error:", err.message);
      return res.status(500).json({ message: "Erreur serveur" });
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    const { email } = req.body || {};
    console.log(`[LOGIN] Attempt for: ${email || "(no email)"}`);

    passport.authenticate("local", (err: any, user: User | false, info: any) => {
      if (err) {
        console.error("[LOGIN_ERROR] Passport strategy error:", err.message, err.stack);
        return res.status(500).json({ message: "Erreur serveur lors de l'authentification", detail: err.message });
      }
      if (!user) {
        console.log(`[LOGIN] Rejected: ${info?.message}`);
        return res.status(401).json({ message: info?.message || "Identifiants incorrects" });
      }

      console.log(`[LOGIN] Credentials valid for user ${user.id}, saving session...`);
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error("[LOGIN_ERROR] Session save error:", loginErr.message, loginErr.stack);
          return res.status(500).json({ message: "Erreur lors de la sauvegarde de session", detail: loginErr.message });
        }
        console.log(`[LOGIN] ✓ User ${user.id} (${email}) logged in successfully`);
        const { password: _, ...safeUser } = user;
        return res.json(safeUser);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Erreur lors de la déconnexion" });
      res.json({ message: "Déconnecté" });
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Non authentifié" });
    }
    if (req.user!.isActive === 0 && !req.user!.isSuperAdmin) {
      return res.status(403).json({ suspended: true, message: "Votre compte est suspendu. Veuillez contacter l'administration." });
    }
    const { password: _, ...safeUser } = req.user!;
    const originalSuperAdminId = (req.session as any).originalSuperAdminId;
    res.json({
      ...safeUser,
      isImpersonating: !!originalSuperAdminId,
      originalSuperAdminId: originalSuperAdminId || null,
    });
  });
}

export function requireAuth(req: any, res: any, next: any) {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Non authentifié" });
  if (req.user.isActive === 0 && !req.user.isSuperAdmin) return res.status(403).json({ suspended: true, message: "Votre compte est suspendu. Veuillez contacter l'administration." });
  if (req.user.role === "owner" && !req.user.isSuperAdmin && !req.user.isEmailVerified) {
    return res.status(403).json({ needsVerification: true, message: "Veuillez vérifier votre adresse email pour accéder au tableau de bord." });
  }
  return next();
}

export function requireAdmin(req: any, res: any, next: any) {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Non authentifié" });
  if (req.user.role !== "owner") return res.status(403).json({ message: "Accès refusé" });
  return next();
}

export async function requireActiveSubscription(req: any, res: any, next: any) {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Non authentifié" });
  if (req.user.isSuperAdmin) return next();
  if (!req.user.storeId) return next();
  const paywall = await storage.checkPaywall(req.user.storeId);
  if (paywall.isBlocked) {
    return res.status(402).json({
      paywall: true,
      reason: paywall.reason,
      message: paywall.reason === 'expired'
        ? "Votre abonnement a expiré. Veuillez renouveler votre paiement pour continuer."
        : `Limite de commandes atteinte (${paywall.current}/${paywall.limit}). Veuillez passer au plan supérieur.`,
    });
  }
  return next();
}
