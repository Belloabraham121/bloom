/**
 * File-backed cache for local dev durability. Server memory and Redis can both
 * go away (dev restarts, no Docker); this keeps demo sessions and canvas
 * models alive across restarts. Best-effort only — never throws.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function cacheDir(): string | null {
  try {
    const dir = join(process.cwd(), "node_modules", ".cache", "bloom");
    mkdirSync(dir, { recursive: true });
    return dir;
  } catch {
    return null;
  }
}

export function cacheFileName(...parts: string[]): string {
  const safe = parts
    .map((part) => part.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "x")
    .join("__");
  return `${safe}.json`;
}

export function readCacheFile(name: string): string | null {
  try {
    const dir = cacheDir();
    if (!dir) return null;
    return readFileSync(join(dir, name), "utf8");
  } catch {
    return null;
  }
}

export function writeCacheFile(name: string, data: string): void {
  try {
    const dir = cacheDir();
    if (!dir) return;
    writeFileSync(join(dir, name), data);
  } catch {
    /* cache is optional */
  }
}
