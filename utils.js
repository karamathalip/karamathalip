// pipeline/utils.js
// Shared utilities: logger, file helpers, retry logic
import "dotenv/config";
import winston from "winston";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");

// ── Logger ────────────────────────────────────────────────────────────────────
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: "HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message }) =>
      `[${timestamp}] ${level}: ${message}`
    )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(ROOT, "logs", `pipeline-${datestamp()}.log`),
    }),
  ],
});

// ── Date helpers ──────────────────────────────────────────────────────────────
export function datestamp() {
  return new Date().toISOString().slice(0, 10);
}

export function timestamp() {
  return Date.now();
}

// ── File helpers ──────────────────────────────────────────────────────────────
export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

export function writeJSON(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function saveBase64File(base64, filePath) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
}

export function saveBinaryFile(buffer, filePath) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, buffer);
}

// ── Retry wrapper ─────────────────────────────────────────────────────────────
export async function withRetry(fn, retries = 3, delayMs = 2000, label = "") {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLast = attempt === retries;
      logger.warn(
        `${label || "Operation"} failed (attempt ${attempt}/${retries}): ${err.message}`
      );
      if (isLast) throw err;
      await sleep(delayMs * attempt);
    }
  }
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Paths ─────────────────────────────────────────────────────────────────────
export const PATHS = {
  scripts:    path.join(ROOT, "scripts"),
  voices:     path.join(ROOT, "audio", "voices"),
  sfx:        path.join(ROOT, "audio", "sfx"),
  images:     path.join(ROOT, "images"),
  thumbnails: path.join(ROOT, "thumbnails"),
  videos:     path.join(ROOT, "videos"),
  final:      path.join(ROOT, "output", "final"),
  components: path.join(ROOT, "components"),
  templates:  path.join(ROOT, "templates"),
  logs:       path.join(ROOT, "logs"),
};

// ensure all paths exist on import
Object.values(PATHS).forEach(ensureDir);
