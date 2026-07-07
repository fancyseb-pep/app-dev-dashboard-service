// src/routes/chatbot.js
//
// Chatbot endpoint backed by Gemini (Google's Gen AI API).
//
// "Training" here means grounding: since Gemini can't be fine-tuned on your
// private dashboard, every new chat session is seeded with a detailed
// system instruction (see ../constants/dashboardKnowledge.js) describing
// the dashboard's pages, filters, and metrics. That's what makes answers
// dashboard-specific instead of generic.

import { GoogleGenAI } from "@google/genai";
import { Router } from "express";
import { DASHBOARD_KNOWLEDGE } from "../constants/dashboardKnowledge.js";

const router = Router();

// Single client for the process. Reads GEMINI_API_KEY from env automatically,
// but we pass it explicitly so a missing key fails loudly and early.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// gemini-2.5-flash is the current stable, cost-efficient chat model.
// (gemini-1.5-flash / the old @google/generative-ai package are legacy —
// avoid them for new work.)
const MODEL = "gemini-2.5-flash";

// In-memory session store: sessionId -> chat object.
// Fine for local/dev or a single-instance deployment. On BTP with multiple
// app instances, sessions won't be shared across instances — move to Redis
// (or make the client always send full history) if that becomes a problem.
const sessions = new Map();

// Sessions older than this are dropped on the next cleanup sweep so memory
// doesn't grow unbounded.
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
console.log("Key loaded:", process.env.GEMINI_API_KEY ? "yes (" + process.env.GEMINI_API_KEY.slice(0,6) + "...)" : "NO — MISSING");
function generateSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function cleanupSessions() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastUsed > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

function getOrCreateSession(sessionId, dashboardContext) {
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId);
    session.lastUsed = Date.now();
    return { id: sessionId, chat: session.chat };
  }

  const id = sessionId || generateSessionId();

  const systemInstruction = dashboardContext
    ? `${DASHBOARD_KNOWLEDGE}\n\nThe user is currently viewing: ${dashboardContext}.`
    : DASHBOARD_KNOWLEDGE;

  const chat = ai.chats.create({
    model: MODEL,
    config: {
      systemInstruction,
      temperature: 0.3, // lower = more consistent, factual answers
      maxOutputTokens: 512,
    },
  });

  sessions.set(id, { chat, lastUsed: Date.now() });
  return { id, chat };
}

router.post("/chat", async (req, res) => {
  try {
    const { message, dashboardContext, sessionId } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: "Message is too long" });
    }

    cleanupSessions();

    const { id: currentSessionId, chat } = getOrCreateSession(
      sessionId,
      dashboardContext
    );

    const result = await chat.sendMessage({ message: message.trim() });

    res.json({
      response: result.text,
      sessionId: currentSessionId,
    });
  } catch (error) {
    console.error("Chatbot error:", error);
    res.status(500).json({ error: "Failed to process chat message" });
  }
});

// Clear conversation history for a session
router.post("/clear", (req, res) => {
  const { sessionId } = req.body;
  if (sessionId && sessions.has(sessionId)) {
    sessions.delete(sessionId);
    return res.json({ message: "Conversation cleared" });
  }
  res.json({ message: "No conversation to clear" });
});

export default router;