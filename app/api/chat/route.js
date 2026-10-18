// PinDrop AI. Answers questions, finds live pins and drafts pins for people
// to review. Uses Google Gemini when GEMINI_API_KEY is set (with tools), or
// Claude when only ANTHROPIC_API_KEY is set (questions only).
//
// The reply streams as newline-delimited JSON events:
//   {"type":"text","text":"..."}     part of the answer
//   {"type":"pins","pins":[...]}     search results to show as cards
//   {"type":"draft","draft":{...}}   a checked pin to review and post
//
// It only sees the conversation the visitor types plus public pins; it can't
// read accounts or private data, and it never creates anything itself.
import Anthropic from "@anthropic-ai/sdk";
import { ApiError, GoogleGenAI } from "@google/genai";
import { CATEGORY_GUIDE, TOOL_DECLARATIONS, checkDraft, searchPins } from "@/lib/assistant-tools";

// Flash-Lite answers in under a second; if it's overloaded, try Flash once.
const GEMINI_MODELS = [
  ...new Set([process.env.GEMINI_MODEL || "gemini-flash-lite-latest", "gemini-flash-latest"]),
];
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
// Short answers keep the assistant quick and its cost bounded.
const MAX_OUTPUT_TOKENS = 1024;
const MAX_TOOL_ROUNDS = 3;
const MAX_TURNS = 20;
const MAX_CHARS = 2000;

function provider() {
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

const ABOUT = `You are PinDrop AI, the friendly assistant inside PinDrop: a community map around De Anza College and the Bay Area where neighbors drop pins to request help, offer help, share places and resources, post events, and raise alerts.

How PinDrop works:
- Browse the map or list; filters cover Requesting, Offering, Places, Alerts, Nature, Events, Completed, Saved and Mine. Search matches titles, descriptions, categories and skills.
- Sign in with an email link (no password) to drop pins, respond, save, confirm, report or block.
- "Drop a pin": choose a type and community category, write a short title (3–80 characters) and optional description, then optional details (payment or exchange, timing, skills, meeting preferences, photo), then place it on the map.
- Sensitive categories (home, care, wellness) default to an approximate location: others see a random point within about 400 m, never the exact spot.
- On a request, "I can help" sends an offer; the author accepts or declines; the two can message privately; either marks it done. Offers work the same way with "I'm interested".
- Requests expire after 7 days and alerts after 24 hours unless a date is set. Pins reported by several people are hidden until reviewed.
- The "Our solution" page (/solution) explains the problem PinDrop solves; About (/about) introduces the team; Contact (/contact) reaches a real person on the team.
- PinDrop doesn't process payments, verify qualifications, or replace emergency services. For danger, tell people to call 911.

Keep answers short and practical. If you don't know something about PinDrop, say so rather than guessing. Never ask for or repeat addresses, phone numbers or other personal details.`;

const GEMINI_SYSTEM = `${ABOUT}

You have two tools:
- search_pins: use it whenever someone wants to find or check for something ("anyone offering tutoring?", "free food today?"). The results are shown to them as cards, so don't list every result again: say briefly what you found. Results marked sample are fictional examples; say so if you mention them. If nothing matches, say so and suggest dropping a pin.
- draft_pin: use it when someone wants to ask for help, offer something, announce an event, share a place or post an alert. Pick the type and an allowed category from the list below, write a clear title and a short helpful description. If the tool reports problems, fix them and try once more. After a successful draft, tell them to tap "Review & post" to check it, place it on the map and publish. You never publish pins yourself; don't say you did.

Allowed categories by type (group id (label): items):
${CATEGORY_GUIDE}`;

const CLAUDE_SYSTEM = `${ABOUT}

You can't see or search pins, and you can't create pins; suggest a type, category, title and description they can use in "Drop a pin".`;

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

const BUSY = "PinDrop AI is busy right now. Please try again shortly.";
const MISCONFIGURED = "PinDrop AI isn’t configured correctly.";
const FAILED = "PinDrop AI couldn’t answer just now. Please try again.";

// Runs a tool call from Gemini. Returns [result for the model, event for the page].
async function runTool(call) {
  const args = call.args || {};
  if (call.name === "search_pins") {
    const pins = await searchPins(args);
    return [{ pins }, { type: "pins", pins }];
  }
  if (call.name === "draft_pin") {
    const result = checkDraft(args);
    return [result, result.ok ? { type: "draft", draft: result.draft } : null];
  }
  return [{ error: `Unknown tool ${call.name}` }, null];
}

// Yields events from Gemini, running its tool calls in between.
async function* geminiReply(messages, signal) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  let modelIndex = 0;
  let sentText = false;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const parts = [];
    const calls = [];
    let finish;
    try {
      const stream = await ai.models.generateContentStream({
        model: GEMINI_MODELS[modelIndex],
        contents,
        config: {
          systemInstruction: GEMINI_SYSTEM,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          abortSignal: signal,
          // No more tools on the last round, so the model has to answer.
          ...(round < MAX_TOOL_ROUNDS ? { tools: [{ functionDeclarations: TOOL_DECLARATIONS }] } : {}),
        },
      });
      for await (const chunk of stream) {
        const candidate = chunk.candidates?.[0];
        // Keep every part exactly as sent (including thought signatures),
        // because Gemini needs them back alongside the tool results.
        for (const part of candidate?.content?.parts || []) {
          parts.push(part);
          if (part.functionCall) calls.push(part.functionCall);
          else if (part.text && !part.thought) {
            sentText = true;
            yield { type: "text", text: part.text };
          }
        }
        finish = candidate?.finishReason || finish;
      }
    } catch (error) {
      if (signal.aborted) return;
      const busy = error instanceof ApiError && [429, 500, 503].includes(error.status);
      // Busy before anything was sent: quietly try the next model.
      if (busy && !sentText && round === 0 && modelIndex < GEMINI_MODELS.length - 1) {
        modelIndex += 1;
        round -= 1;
        continue;
      }
      console.error("chat error (gemini)", GEMINI_MODELS[modelIndex], error?.status, error?.message);
      const text = busy
        ? BUSY
        : error instanceof ApiError && (error.status === 400 || error.status === 403)
          ? MISCONFIGURED
          : FAILED;
      yield { type: "text", text: sentText ? `\n\n${text}` : text };
      return;
    }

    if (!calls.length) {
      if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT") {
        yield { type: "text", text: "Sorry, I can’t help with that one." };
      } else if (finish === "MAX_TOKENS") {
        yield { type: "text", text: "…" };
      } else if (!sentText) {
        yield { type: "text", text: "Sorry, I didn’t catch that. Could you rephrase?" };
      }
      return;
    }

    contents.push({ role: "model", parts });
    const responses = [];
    for (const call of calls) {
      const [result, event] = await runTool(call);
      if (event) yield event;
      responses.push({ functionResponse: { id: call.id, name: call.name, response: result } });
    }
    contents.push({ role: "user", parts: responses });
  }
}

// Yields events from Claude (answers questions; no tools).
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
      system: CLAUDE_SYSTEM,
      messages,
    },
    { signal },
  );
  try {
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "text", text: event.delta.text };
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") yield { type: "text", text: "Sorry, I can’t help with that one." };
    else if (final.stop_reason === "max_tokens") yield { type: "text", text: "…" };
  } catch (error) {
    if (signal.aborted) return;
    console.error("chat error (claude)", error?.status, error?.message);
    yield {
      type: "text",
      text: `\n\n${
        error instanceof Anthropic.RateLimitError
          ? BUSY
          : error instanceof Anthropic.AuthenticationError
            ? MISCONFIGURED
            : FAILED
      }`,
    };
  }
}

export function GET() {
  return json({ available: Boolean(provider()), tools: provider() === "gemini" }, 200);
}

export async function POST(request) {
  if (!provider()) {
    return json({ error: "PinDrop AI isn’t set up on this site yet." }, 503);
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
  const reply =
    provider() === "gemini" ? geminiReply(messages, abort.signal) : claudeReply(messages, abort.signal);
  const encoder = new TextEncoder();
  const body$ = new ReadableStream({
    async start(controller) {
      for await (const event of reply) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      controller.close();
    },
    // The visitor closed the chat or left the page.
    cancel() {
      abort.abort();
    },
  });

  return new Response(body$, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
