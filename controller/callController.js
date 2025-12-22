import twilio from "twilio";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Meeting from "../models/Meeting.js";

dotenv.config();

/* =======================
   SIMPLE LOGGER
======================= */
const log = (...args) => {
    console.log(`[${new Date().toISOString()}]`, ...args);
};

/* =======================
   TWILIO CLIENT
======================= */
const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

/* =======================
   GEMINI SETUP
======================= */
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/* =======================
   IN-MEMORY STORE
======================= */
const callHistories = new Map();

/* =======================
   SERVER URL (MUST BE PUBLIC)
======================= */
const SERVER_URL = process.env.SERVER_URL;

if (!SERVER_URL) {
    throw new Error("SERVER_URL is not set in .env");
}

/* =======================
   START CALL
======================= */
export const startCall = async (req, res) => {
    try {
        log("📞 START CALL API HIT");
        log("Request body:", req.body);

        const { phoneNumber } = req.body;

        if (!phoneNumber) {
            log("❌ ERROR: phoneNumber missing");
            return res.status(400).json({ message: "Phone number is required" });
        }

        log("Creating Twilio call to:", phoneNumber);

        const call = await client.calls.create({
            to: phoneNumber,
            from: process.env.TWILIO_PHONE_NUMBER,
            url: `${SERVER_URL}/api/call/voice`,
        });

        log("✅ Call created. SID:", call.sid);

        /* =======================
           SYSTEM PROMPT (CRITICAL)
        ======================= */
        callHistories.set(call.sid, [
            {
                role: "model",
                parts: [
                    {
                        text: `
You are a professional AI voice assistant calling on behalf of Mative Inc.

GOAL:
- Have a natural phone conversation.
- Collect the user's FULL NAME and EMAIL ADDRESS.
- Schedule a meeting once details are collected.

CONVERSATION RULES:
- Ask ONE question at a time.
- Do NOT rush the user.
- If the user gives partial information, ask a follow-up.
- If the user asks a question, answer it politely first.
- Never assume missing information.
- Keep responses short and natural for a phone call.

IMPORTANT OUTPUT RULES:
- DO NOT output JSON unless BOTH name AND email are clearly confirmed.
- When complete, output ONLY valid JSON (no extra text).
- JSON format:
  { "name": "User Full Name", "email": "user@email.com", "isComplete": true }

If information is incomplete, continue the conversation normally.
`
                    }
                ]
            }
        ]);

        res.status(200).json({
            message: "Call started successfully",
            sid: call.sid,
        });

    } catch (error) {
        log("❌ ERROR in startCall:", error);
        res.status(500).json({
            message: "Failed to start call",
            error: error.message,
        });
    }
};

/* =======================
   VOICE WEBHOOK
======================= */
/* =======================
   VOICE WEBHOOK
======================= */
export const handleVoice = (req, res) => {
    log("🎤 VOICE WEBHOOK HIT");

    // Create TwiML response
    const twiml = new twilio.twiml.VoiceResponse();

    // The <Connect> verb connects the call to the WebSocket stream
    const connect = twiml.connect();
    connect.stream({
        url: `wss://${SERVER_URL.replace(/^https?:\/\//, "")}/media-stream`
    });

    res.type("text/xml");
    res.send(twiml.toString());
};


/* =======================
   GATHER WEBHOOK (DEPRECATED)
======================= */
// handleGather is no longer needed for Media Stream implementation
// but keeping a placeholder to avoid 404s if any old calls linger
export const handleGather = (req, res) => {
    res.status(200).send("");
};
