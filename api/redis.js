import { Redis } from "@upstash/redis";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Load .env.local from the project root when vercel dev hasn't injected vars
// dotenv.config() is a no-op for vars that are already set, so this is safe in production
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: join(root, ".env.local") });
dotenv.config({ path: join(root, ".env") });

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

if (!url || !token) {
  console.error("[redis] Missing Redis env vars — check UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN.");
}

export const redis = new Redis({ url, token });
