// The PinDrop helper chatbot. Streams the reply as plain text, from Google
// Gemini when GEMINI_API_KEY is set, otherwise from Claude when
// ANTHROPIC_API_KEY is set. It only sees the conversation the visitor types;
// it has no access to the database or anyone's account.
import Anthropic from "@anthropic-ai/sdk";
import { ApiError, GoogleGenAI } from "@google/genai";

// Flash-Lite answers in under a second; if it's overloaded, try Flash once.
const GEMINI_MODELS = [
  ...new Set([process.env.GEMINI_MODEL || "gemini-flash-lite-latest", "gemini-flash-latest"]),
];
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
// Short answers keep the helper quick and its cost bounded.
const MAX_OUTPUT_TOKENS = 1024;

function provider() {
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}
const MAX_TURNS = 20;
const MAX_CHARS = 2000;

const SYSTEM = `You are the PinDrop helper, a friendly assistant inside PinDrop: a community map around De Anza College and the Bay Area where neighbors drop pins to request help, offer help, share places and resources, post events, and raise alerts.

How PinDrop works:
- Browse the map or list; filters cover Requesting, Offering, Places, Alerts, Nature, Events, Completed, Saved and Mine. Search matches titles, descriptions, categories and skills.
- Sign in with an email link (no password) to drop pins, respond, save, confirm, report or block.
- "Drop a pin": choose a type and community category, write a short title (3–80 characters) and optional description, then optional details (payment or exchange, timing, skills, meeting preferences, photo), then place it on the map.
- Sensitive categories (home, care, wellness) default to an approximate location: others see a random point within about 400 m, never the exact spot.
- On a request, "I can help" sends an offer; the author accepts or declines; the two can message privately; either marks it done. Offers work the same way with "I'm interested".
- Requests expire after 7 days and alerts after 24 hours unless a date is set. Pins reported by several people are hidden until reviewed.
- The "Our solution" page (/solution) explains the problem PinDrop solves; About (/about) introduces the team; Contact (/contact) reaches a real person on the team.
- PinDrop doesn't process payments, verify qualifications, or replace emergency services. For danger, tell people to call 911.

When someone wants help writing a pin, suggest a type, a community category, a clear title under 80 characters and a short description, without personal details like addresses or phone numbers. Keep answers short and practical. If you don't know something about PinDrop, say so rather than guessing. You can't see the map, pins or accounts.`;

// Best-effort limit per IP. Serverless instances don't share memory, so this
// slows abuse rather than guaranteeing a hard cap; use a shared store such as
// Upstash or Vercel KV for strict limits.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 20;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > MAX_REQUESTS;
}

// Accepts only alternating user/assistant text turns, starting and ending
// with the user.
function cleanMessages(input) {
  if (!Array.isArray(input) || !input.length || input.length > MAX_TURNS) return null;
  const messages = [];
  for (const [index, message] of input.entries()) {
    const role = index % 2 === 0 ? "user" : "assistant";
    if (message?.role !== role || typeof message.content !== "string") return null;
    const content = message.content.trim().slice(0, MAX_CHARS);
    if (!content) return null;
    messages.push({ role, content });
  }
  return messages.at(-1).role === "user" ? messages : null;
}

const json = (body, status) => Response.json(body, { status });

// Yields the reply text from Gemini.
async function* geminiReply(messages, signal) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  for (const [index, model] of GEMINI_MODELS.entries()) {
    let started = false;
    let finish;
    try {
      const stream = await ai.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction: SYSTEM,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          abortSignal: signal,
        },
      });
      for await (const chunk of stream) {
        if (chunk.text) {
          started = true;
          yield chunk.text;
        }
        finish = chunk.candidates?.[0]?.finishReason || finish;
      }
    } catch (error) {
      if (signal.aborted) return;
      const busy = error instanceof ApiError && [429, 500, 503].includes(error.status);
      // Busy before any text was sent: quietly try the next model.
      if (busy && !started && index < GEMINI_MODELS.length - 1) continue;
      console.error("chat error (gemini)", model, error?.status, error?.message);
      yield `${started ? "\n\n" : ""}${
        busy
          ? "The assistant is busy right now. Please try again shortly."
          : error instanceof ApiError && (error.status === 400 || error.status === 403)
            ? "The assistant isn’t configured correctly."
            : "The assistant couldn’t answer just now. Please try again."
      }`;
      return;
    }
    if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT") yield "Sorry, I can’t help with that one.";
    else if (finish === "MAX_TOKENS") yield "…";
    return;
  }
}

// Yields the reply text from Claude.
async function* claudeReply(messages, signal) {
  const client = new Anthropic();
  const stream = client.beta.messages.stream(
    {
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      output_config: { effort: "low" },
      // If the model declines on safety grounds, the API retries on its
      // recommended fallback model instead of returning a refusal.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages,
    },
    { signal },
  );
  try {
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") yield "Sorry, I can’t help with that one.";
    else if (final.stop_reason === "max_tokens") yield "…";
  } catch (error) {
    if (signal.aborted) return;
    console.error("chat error (claude)", error?.status, error?.message);
    yield `\n\n${
      error instanceof Anthropic.RateLimitError
        ? "The assistant is busy right now. Please try again shortly."
        : error instanceof Anthropic.AuthenticationError
          ? "The assistant isn’t configured correctly."
          : "The assistant couldn’t answer just now. Please try again."
    }`;
  }
}

export function GET() {
  return json({ available: Boolean(provider()) }, 200);
}

export async function POST(request) {
  if (!provider()) {
    return json({ error: "The assistant isn’t set up on this site yet." }, 503);
  }
  // Only PinDrop's own pages may use this endpoint.
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).host !== request.headers.get("host")) {
    return json({ error: "Not allowed." }, 403);
  }
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (rateLimited(ip)) {
    return json({ error: "You’ve sent a lot of messages. Try again in a few minutes." }, 429);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const messages = cleanMessages(body?.messages);
  if (!messages) return json({ error: "Invalid conversation." }, 400);

  const abort = new AbortController();
  const reply = provider() === "gemini" ? geminiReply(messages, abort.signal) : claudeReply(messages, abort.signal);
  const encoder = new TextEncoder();
  const body$ = new ReadableStream({
    async start(controller) {
      for await (const text of reply) controller.enqueue(encoder.encode(text));
      controller.close();
    },
    // The visitor closed the chat or left the page.
    cancel() {
      abort.abort();
    },
  });

  return new Response(body$, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
