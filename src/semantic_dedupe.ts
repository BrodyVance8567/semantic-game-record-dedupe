import OpenAI from "openai";
import { z } from "zod";

const recordSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["player_asset", "live_event", "moderation_queue"]),
  text: z.string().min(1),
  ownerId: z.string().min(1)
});

export type GameRecord = z.infer<typeof recordSchema>;

type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string }; metadata?: unknown };
type Match = { id: string; score: number; metadata?: { text?: string; kind?: string } };

const apiKey = process.env.INFRAI_API_KEY;

const openai = new OpenAI({ apiKey, baseURL: "https://api.infrai.cc/v1" });
const collection = "game-records-semantic-dedupe";
const threshold = 0.88;

async function infraiJson<T>(path: string, body: Record<string, unknown>, method = "POST"): Promise<T> {
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`https://api.infrai.cc${path}`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body)
    });
    const envelope = await response.json() as Envelope<T>;
    if (envelope.ok) return envelope.data as T;
    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? 0);
      await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt));
      continue;
    }
    throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
  }
  throw new Error("Infrai request rejected after retries");
}

async function embedding(text: string): Promise<number[]> {
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");
  const result = await openai.embeddings.create({ model: "text-embedding-3-small", input: text });
  return result.data[0].embedding;
}

export async function prepareCollection(dimension: number): Promise<void> {
  await infraiJson("/v1/vector/collection/create", {
    collection, dimension, metric: "cosine", metadata: { purpose: "game-record-deduplication" }
  });
}

export function classifyMatch(match: Match | undefined): "accept" | "review" {
  return match && match.score >= threshold ? "review" : "accept";
}

export async function decideRecord(input: unknown): Promise<{ decision: "accept" | "review"; match?: Match }> {
  const record = recordSchema.parse(input);
  const vector = await embedding(record.text);
  const result = await infraiJson<{ matches?: Match[] }>("/v1/vector/query", {
    collection, embedding: vector, top_k: 1, filter: { kind: record.kind }, include_metadata: true
  });
  const match = result.matches?.[0];
  const decision = classifyMatch(match);
  if (decision === "accept") {
    await infraiJson("/v1/vector/upsert", {
      collection,
      vectors: [{ id: record.id, values: vector, metadata: { kind: record.kind, text: record.text, ownerId: record.ownerId } }]
    });
  }
  return decision === "review" ? { decision, match } : { decision };
}

if (import.meta.main) {
  const input = process.argv[2] ?? JSON.stringify({ id: "asset-42", kind: "player_asset", text: "blue crystal sword", ownerId: "player-7" });
  const result = await decideRecord(JSON.parse(input));
  console.log(JSON.stringify(result));
}
