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
        log("START CALL API HIT");
        log("Request body:", req.body);

        const { phoneNumber } = req.body;

        if (!phoneNumber) {
            log("ERROR: phoneNumber missing");
            return res.status(400).json({ message: "Phone number is required" });
        }

        log("Creating Twilio call to:", phoneNumber);

        const call = await client.calls.create({
            to: phoneNumber,
            from: process.env.TWILIO_PHONE_NUMBER,
            url: `${SERVER_URL}/api/call/voice`,
        });

        log("Call created successfully. SID:", call.sid);

        // Initialize AI system prompt
        callHistories.set(call.sid, [
            {
                role: "model",
                parts: [
                    {
                        text:
                            "You are an AI assistant for Mative Inc. " +
                            "Your goal is to schedule a meeting. " +
                            "You must collect the user's Name and Email. " +
                            "Be polite, professional, and concise. " +
                            "ONLY return JSON when both Name and Email are collected. " +
                            'JSON format: { "name": "", "email": "", "isComplete": true }',
                    },
                ],
            },
        ]);

        res.status(200).json({
            message: "Call started successfully",
            sid: call.sid,
        });
    } catch (error) {
        log("ERROR in startCall:", error);
        res.status(500).json({
            message: "Failed to start call",
            error: error.message,
        });
    }
};

/* =======================
   VOICE WEBHOOK
======================= */
export const handleVoice = (req, res) => {
    log("VOICE WEBHOOK HIT");
    log("Voice request body:", req.body);

    const twiml = new twilio.twiml.VoiceResponse();

    twiml.say(
        "Hello, this is Mative Inc. I would like to schedule a meeting with you. Who am I speaking with?"
    );

    twiml.gather({
        input: "speech",
        action: `${SERVER_URL}/api/call/gather`,
        timeout: 5,
        speechTimeout: "auto",
    });

    res.type("text/xml");
    res.send(twiml.toString());
};

/* =======================
   GATHER WEBHOOK
======================= */
export const handleGather = async (req, res) => {
    log("GATHER WEBHOOK HIT");
    log("Gather request body:", req.body);

    const { CallSid, SpeechResult, From } = req.body;
    const twiml = new twilio.twiml.VoiceResponse();

    try {
        if (!SpeechResult) {
            log("No speech detected");

            twiml.say("I didn't catch that. Could you please repeat?");
            twiml.gather({
                input: "speech",
                action: `${SERVER_URL}/api/call/gather`,
                timeout: 5,
            });

            res.type("text/xml");
            return res.send(twiml.toString());
        }

        log("User said:", SpeechResult);

        let history = callHistories.get(CallSid) || [];
        history.push({ role: "user", parts: [{ text: SpeechResult }] });

        log("Sending message to Gemini");

        const chat = model.startChat({ history });
        const result = await chat.sendMessage(SpeechResult);
        const responseText = result.response.text();

        log("Gemini response:", responseText);

        history.push({ role: "model", parts: [{ text: responseText }] });
        callHistories.set(CallSid, history);

        /* =======================
           CHECK FOR JSON COMPLETION
        ======================= */
        if (responseText.trim().startsWith("{")) {
            try {
                const data = JSON.parse(responseText);
                log("Parsed JSON:", data);

                if (data.isComplete) {
                    log("Meeting details complete. Saving to DB.");

                    const meeting = new Meeting({
                        name: data.name,
                        email: data.email,
                        phoneNumber: From || "Unknown",
                    });

                    await meeting.save();

                    twiml.say(
                        "Thank you. Your meeting details have been recorded. Have a great day!"
                    );
                    twiml.hangup();

                    callHistories.delete(CallSid);

                    res.type("text/xml");
                    return res.send(twiml.toString());
                }
            } catch (err) {
                log("JSON parse error:", err);
            }
        }

        /* =======================
           CONTINUE CONVERSATION
        ======================= */
        const cleanResponse = responseText.replace(/\{.*\}/s, "").trim();

        twiml.say(cleanResponse || "Could you please clarify that?");
        twiml.gather({
            input: "speech",
            action: `${SERVER_URL}/api/call/gather`,
            timeout: 5,
        });

    } catch (error) {
        log("ERROR in handleGather:", error);

        twiml.say(
            "Sorry, I am having trouble processing your request. Please try again later."
        );
        twiml.hangup();
    }

    res.type("text/xml");
    res.send(twiml.toString());
};
