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

export function setupAuth(app: Express) {
  const PgSession = connectPgSimple(session);

  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET environment variable is required");
  }

  const isProduction = process.env.NODE_ENV === "production";

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new PgSession({
      pool: pool,
      tableName: "sessions",
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
      });

      await storage.createSubscription({
        storeId: store.id,
        plan: 'trial',
        monthlyLimit: 60,
        pricePerMonth: 0,
        currentMonthOrders: 0,
        isActive: 1,
      });

      req.login(user, (err) => {
        if (err) return next(err);
        const { password: _, ...safeUser } = user;
        return res.status(201).json(safeUser);
      });
    } catch (err) {
      console.error("Signup error:", err);
      return res.status(500).json({ message: "Erreur lors de l'inscription" });
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: User | false, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Identifiants incorrects" });

      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
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
  return next();
}

export function requireAdmin(req: any, res: any, next: any) {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Non authentifié" });
  if (req.user.role !== "owner") return res.status(403).json({ message: "Accès refusé" });
  return next();
}
