import twilio from "twilio";
const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;
import dotenv from "dotenv";
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
   SERVER URL (PUBLIC)
======================= */
const SERVER_URL = process.env.SERVER_URL;

if (!SERVER_URL) {
    throw new Error("SERVER_URL is not set in .env");
}

/* =======================
   CONVERSATION STATE
   Stores: { name, email, conversationHistory }
======================= */
const conversationStates = new Map();

const getConversationState = (callSid, phoneNumber = null, companyName = "Mative Labs", objective = "schedule a meeting") => {
    if (!conversationStates.has(callSid)) {
        conversationStates.set(callSid, {
            name: null,
            email: null,
            interested: false,
            stage: "NAME", // NAME, PITCH, EMAIL, END
            phoneNumber: phoneNumber,
            companyName: companyName,
            objective: objective,
            conversationHistory: [],
        });
    }
    return conversationStates.get(callSid);
};

const clearConversationState = (callSid) => {
    conversationStates.delete(callSid);
};



/* =======================
   TWILIO VOICE TOKEN
======================= */
export const getVoiceToken = (req, res) => {
    try {
        const {
            TWILIO_ACCOUNT_SID,
            TWILIO_API_KEY_SID,
            TWILIO_API_KEY_SECRET,
            TWILIO_TWIML_APP_SID
        } = process.env;

        if (!TWILIO_ACCOUNT_SID || !TWILIO_API_KEY_SID || !TWILIO_API_KEY_SECRET || !TWILIO_TWIML_APP_SID) {
            const missing = [];
            if (!TWILIO_ACCOUNT_SID) missing.push("TWILIO_ACCOUNT_SID");
            if (!TWILIO_API_KEY_SID) missing.push("TWILIO_API_KEY_SID");
            if (!TWILIO_API_KEY_SECRET) missing.push("TWILIO_API_KEY_SECRET");
            if (!TWILIO_TWIML_APP_SID) missing.push("TWILIO_TWIML_APP_SID");

            log("❌ Missing Twilio environment variables:", missing.join(", "));
            return res.status(500).json({
                error: "Missing required Twilio configuration",
                missingFields: missing
            });
        }

        const identity = "web-user-" + Math.floor(Math.random() * 10000);

        const accessToken = new AccessToken(
            TWILIO_ACCOUNT_SID,
            TWILIO_API_KEY_SID,
            TWILIO_API_KEY_SECRET,
            { identity: identity }
        );

        const grant = new VoiceGrant({
            outgoingApplicationSid: TWILIO_TWIML_APP_SID,
            incomingAllow: true,
        });

        accessToken.addGrant(grant);

        res.json({
            identity: identity,
            token: accessToken.toJwt(),
        });
    } catch (error) {
        log("❌ Error generating token:", error);
        res.status(500).json({ error: error.message });
    }
};

/* =======================
   HANDLE OUTGOING WEB CALL
======================= */
export const handleOutgoingCall = (req, res) => {
    log("📞 OUTGOING WEB CALL HIT:", req.body);
    let { To } = req.body;

    const response = new twilio.twiml.VoiceResponse();

    if (To) {
        // Simple formatting for Pakistan: if starts with 0 and 11 digits, change to +92
        let dialedNumber = To.replace(/\s+/g, ''); // Remove spaces
        if (dialedNumber.startsWith('0') && dialedNumber.length === 11) {
            dialedNumber = '+92' + dialedNumber.substring(1);
        } else if (!dialedNumber.startsWith('+')) {
            // If it doesn't have a plus, assume it's just missing +92
            dialedNumber = '+92' + (dialedNumber.startsWith('0') ? dialedNumber.substring(1) : dialedNumber);
        }

        log(`📱 Dialing formatted number: ${dialedNumber} (Original: ${To})`);
        log(`🆔 Using Caller ID: ${process.env.TWILIO_PHONE_NUMBER}`);

        const dial = response.dial({
            callerId: process.env.TWILIO_PHONE_NUMBER,
        });
        dial.number(dialedNumber);
    } else {
        log("⚠️ No number provided in outgoing call request");
        response.say("No number provided to dial.");
    }

    res.type("text/xml");
    res.send(response.toString());
};

/* =======================
   START CALL API
======================= */
export const startCall = async (req, res) => {
    try {
        log("📞 START CALL API HIT");
        log("Request body:", req.body);

        const { phoneNumber, companyName, objective } = req.body;

        if (!phoneNumber) {
            log("❌ phoneNumber missing");
            return res.status(400).json({
                success: false,
                message: "Phone number is required",
            });
        }

        log("📲 Creating Twilio call to:", phoneNumber);
        log(`Context - Company: ${companyName}, Objective: ${objective}`);

        const call = await client.calls.create({
            to: phoneNumber,
            from: process.env.TWILIO_PHONE_NUMBER,
            url: `${SERVER_URL}/api/call/voice`,
        });

        log("✅ Call created. SID:", call.sid);

        // Initialize state with phone number and context
        getConversationState(call.sid, phoneNumber, companyName, objective);

        res.status(200).json({
            success: true,
            message: "Call started successfully",
            sid: call.sid,
        });
    } catch (error) {
        log("❌ ERROR starting call:", error);

        res.status(500).json({
            success: false,
            message: "Failed to start call",
            error: error.message,
        });
    }
};

/* =======================
   VOICE WEBHOOK
   (Initial call entry point)
=======================*/
export const handleVoice = (req, res) => {
    log("🎤 VOICE WEBHOOK HIT");

    const callSid = req.body.CallSid;
    const state = getConversationState(callSid);
    const twiml = new twilio.twiml.VoiceResponse();

    // Initial greeting
    twiml.say({
        voice: "Polly.Joanna"
    }, `Hello, this is ${state.companyName}. I'm calling to ${state.objective}.`);

    // Gather speech input with FASTER timeout for "smoothness"
    const gather = twiml.gather({
        input: "speech",
        action: `${SERVER_URL}/api/call/gather-response`,
        timeout: 3,
        speechTimeout: "1.0", // Detect end of speech after 1 second of silence
        hints: "Muhammad, Ahmed, Ali, Khan, Pakistan, email, hotmail, gmail, outlook, at, dot, com",
    });

    gather.say({
        voice: "Polly.Joanna"
    }, "May I have your full name please?");

    // If no input, repeat
    twiml.say({
        voice: "Polly.Joanna"
    }, "I didn't catch that. Let me try again.");
    twiml.redirect(`${SERVER_URL}/api/call/voice`);

    res.type("text/xml");
    res.send(twiml.toString());
};

/* =======================
   GATHER RESPONSE HANDLER
   (Process speech-to-text and get AI response)
======================= */
export const handleGatherResponse = async (req, res) => {
    try {
        const callSid = req.body.CallSid;
        const speechResult = req.body.SpeechResult;

        log("📝 GATHER RESPONSE (Scripted) from call:", callSid);
        log("🗣️ User said:", speechResult);

        if (!speechResult) {
            log("⚠️ No speech result received");
            return handleNoInput(res);
        }

        const state = getConversationState(callSid);
        const twiml = new twilio.twiml.VoiceResponse();
        const input = speechResult.toLowerCase().trim();

        // --- STATE MACHINE LOGIC ---
        if (state.stage === "NAME") {
            // Assume the whole result is the name or contains it
            state.name = speechResult.replace(/my name is|i am|this is/gi, "").trim();
            log("✅ Name captured:", state.name);

            state.stage = "PITCH";

            const gather = twiml.gather({
                input: "speech",
                action: `${SERVER_URL}/api/call/gather-response`,
                timeout: 3,
                speechTimeout: "1.0",
                hints: "yes, yeah, sure, okay, ok, redesign, improve, interested",
            });

            gather.say({ voice: "Polly.Joanna" },
                `Okay ${state.name}, I am from ${state.companyName} and we are specifically calling to ${state.objective}. Would you be interested in that?`
            );

            twiml.say({ voice: "Polly.Joanna" }, `I didn't hear you clearly. Would you be interested to ${state.objective}?`);
            twiml.redirect(`${SERVER_URL}/api/call/gather-response`);

        } else if (state.stage === "PITCH") {
            const positiveKeywords = ["yes", "yeah", "sure", "okay", "ok", "interested", "redesign", "improve", "why not", "definitely"];
            const isInterested = positiveKeywords.some(kw => input.includes(kw));

            if (isInterested) {
                state.interested = true;
                log("✅ User expressed INTEREST in a meeting.");

                // Save to DB immediately (Name + Phone Number)
                try {
                    const meeting = new Meeting({
                        name: state.name,
                        email: "Not provided (Scripted Lead)",
                        phoneNumber: state.phoneNumber || "Unknown",
                        companyName: state.companyName,
                        objective: state.objective,
                    });
                    await meeting.save();
                    log("💾 Meeting lead saved to database successfully.");

                    twiml.say({ voice: "Polly.Joanna" },
                        `That's wonderful ${state.name}! I have noted your interest. One of our specialists will contact you at this number very soon. Thank you and have a great day!`
                    );
                } catch (dbError) {
                    log("❌ Error saving meeting to database:", dbError);
                    twiml.say({ voice: "Polly.Joanna" }, "Great! We will contact you soon. Goodbye!");
                }

                twiml.hangup();
                clearConversationState(callSid);
            } else {
                log("❌ User declined interest.");
                twiml.say({ voice: "Polly.Joanna" }, "No problem! Have a great day. Goodbye!");
                twiml.hangup();
                clearConversationState(callSid);
            }
        }

        res.type("text/xml");
        res.send(twiml.toString());

    } catch (error) {
        log("❌ ERROR in gather response:", error);
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say({ voice: "Polly.Joanna" }, "I'm sorry, I'm having technical difficulties. Goodbye!");
        twiml.hangup();
        res.type("text/xml");
        res.send(twiml.toString());
    }
};

/* =======================
   HELPER: Handle No Input
======================= */
const handleNoInput = (res) => {
    const twiml = new twilio.twiml.VoiceResponse();

    twiml.say({
        voice: "Polly.Joanna"
    }, "I didn't hear anything. Let me ask again.");

    const gather = twiml.gather({
        input: "speech",
        action: `${SERVER_URL}/api/call/gather-response`,
        timeout: 3,
        speechTimeout: "1.0",
    });

    gather.say({
        voice: "Polly.Joanna"
    }, "Could you please repeat that?");

    res.type("text/xml");
    res.send(twiml.toString());
};



/* =======================
   DEPRECATED: Old gather endpoint
======================= */
export const handleGather = (_req, res) => {
    res.sendStatus(200);
};
