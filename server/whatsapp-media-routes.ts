import type { Express, RequestHandler } from "express";
import multer from "multer";
import { mkdir } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const formats = {
  image: { limitMb: 10, label: "JPG, PNG, WEBP ou GIF", extensions: {
    "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif",
  } },
  audio: { limitMb: 16, label: "MP3, OGG, OPUS, M4A, AAC ou WAV", extensions: {
    "audio/mpeg": ".mp3", "audio/mp3": ".mp3", "audio/ogg": ".ogg", "audio/opus": ".opus",
    "audio/mp4": ".m4a", "audio/x-m4a": ".m4a", "audio/aac": ".aac", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/webm": ".webm",
  } },
  video: { limitMb: 64, label: "MP4, MOV, WEBM ou 3GP", extensions: {
    "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm", "video/3gpp": ".3gp",
  } },
} as const;

export function registerWhatsappMediaRoutes(app: Express, requireAuth: RequestHandler,
  uploadsBase = path.join(process.env.DATA_DIR ?? path.resolve("."), "uploads")) {
  for (const kind of ["image", "audio", "video"] as const) {
    const config = formats[kind];
    const extensions: Record<string, string> = config.extensions;
    const upload = multer({
      storage: multer.diskStorage({
        destination: (req: any, _file, callback) => {
          const destination = path.join(uploadsBase, "whatsapp", String(req.user.storeId));
          mkdir(destination, { recursive: true }, error => callback(error, destination));
        },
        filename: (_req, file, callback) => callback(null, `${kind}_${randomUUID()}${extensions[file.mimetype.toLowerCase()]}`),
      }),
      limits: { fileSize: config.limitMb * 1024 * 1024, files: 1, fields: 0, parts: 1 },
      fileFilter: (_req, file, callback) => {
        if (extensions[file.mimetype.toLowerCase()]) return callback(null, true);
        const error = new Error(`Format non pris en charge. Utilisez ${config.label}.`);
        error.name = "UnsupportedMedia";
        callback(error);
      },
    }).single("file");

    app.post(`/api/upload/whatsapp-${kind}`, requireAuth, (req: any, res: any) => {
      if (!Number.isSafeInteger(req.user?.storeId) || req.user.storeId <= 0) return res.status(403).json({ message: "Magasin introuvable." });
      upload(req, res, async error => {
        if (error) {
          if (error instanceof multer.MulterError) {
            const tooLarge = error.code === "LIMIT_FILE_SIZE";
            return res.status(tooLarge ? 413 : 400).json({ message: tooLarge
              ? `Fichier trop volumineux. Taille maximale : ${config.limitMb} Mo.`
              : "Envoyez un seul fichier dans le champ file." });
          }
          if (error.name === "UnsupportedMedia") return res.status(415).json({ message: error.message });
          return res.status(500).json({ message: "Impossible de sauvegarder le fichier. Réessayez." });
        }
        if (!req.file) return res.status(400).json({ message: "Aucun fichier fourni." });
        if (!req.file.size) {
          await unlink(req.file.path).catch(() => {});
          return res.status(400).json({ message: "Le fichier est vide." });
        }
        try {
          const relativeUrl = `/uploads/whatsapp/${req.user.storeId}/${req.file.filename}`;
          // Green API must be able to fetch the file from outside the application.
          const base = process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get("host")}`;
          const url = new URL(relativeUrl, base).href;
          res.set("Cache-Control", "no-store");
          return res.json({ url });
        } catch {
          await unlink(req.file.path).catch(() => {});
          return res.status(500).json({ message: "Impossible de créer le lien du fichier." });
        }
      });
    });
  }
}
