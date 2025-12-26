import twilio from "twilio";
const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;
import dotenv from "dotenv";
import Meeting from "../models/Meeting.js";
import CallLog from "../models/CallLog.js";
import ColdCall from "../models/coldCallSchema.js"; // Corrected import path

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
// const client = twilio( // This global client is removed as per the refactor
//     process.env.TWILIO_ACCOUNT_SID,
//     process.env.TWILIO_AUTH_TOKEN
// );


/* =======================
   SERVER URL (PUBLIC)
======================= */
const SERVER_URL = process.env.SERVER_URL;

if (!SERVER_URL) {
    throw new Error("SERVER_URL is not set in .env");
}

/* =======================
   HELPER: CONFIG PROPAGATION
   Encodes/Decodes Twilio config to pass through URLs
 ======================= */
const encodeConfig = (config) => {
    return Buffer.from(JSON.stringify(config)).toString('base64');
};

const decodeConfig = (encoded) => {
    if (!encoded) return null;
    try {
        return JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
    } catch (e) {
        log("❌ Failed to decode config:", e);
        return null;
    }
};

const getTwilioClient = (config) => {
    return twilio(config.accountSid, config.authToken);
};

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
   FETCH TWILIO PHONE NUMBERS
 ======================= */
export const fetchTwilioNumbers = async (req, res) => {
    try {
        const { accountSid, authToken } = req.body;

        if (!accountSid || !authToken) {
            return res.status(400).json({
                success: false,
                message: "Account SID and Auth Token are required.",
            });
        }

        const client = twilio(accountSid, authToken);
        const incomingPhoneNumbers = await client.incomingPhoneNumbers.list({ limit: 50 });

        const numbers = incomingPhoneNumbers.map(num => ({
            phoneNumber: num.phoneNumber,
            friendlyName: num.friendlyName,
            sid: num.sid
        }));

        res.json({
            success: true,
            numbers: numbers
        });
    } catch (error) {
        log("❌ Error fetching Twilio numbers:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch numbers. Please check your credentials.",
            error: error.message
        });
    }
};

/* =======================
   VERIFY TWILIO ACCOUNT
======================= */
export const verifyTwilioAccount = async (req, res) => {
    try {
        const { accountSid, authToken } = req.body;

        if (!accountSid || !authToken) {
            return res.status(400).json({
                success: false,
                message: "Account SID and Auth Token are required",
            });
        }

        const client = twilio(accountSid, authToken);
        await client.api.accounts(accountSid).fetch();

        res.json({
            success: true,
            message: "Twilio account verified successfully",
        });
    } catch (error) {
        log("❌ Twilio verification failed:", error.message);
        res.status(401).json({
            success: false,
            message: "Invalid Twilio credentials",
        });
    }
};

/* =======================
   GENERATE VOICE TOKEN (SDK)
======================= */
export const getVoiceToken = async (req, res) => {
    try {
        const { accountSid, authToken, twimlAppSid, apiKeySid, apiKeySecret } = req.query;

        if (!accountSid || !authToken || !twimlAppSid) {
            return res.status(400).json({
                success: false,
                message: "Account SID, Auth Token, and TwiML App SID are required",
            });
        }

        const client = twilio(accountSid, authToken);
        let finalApiKeySid = apiKeySid;
        let finalApiKeySecret = apiKeySecret;

        // Force new key if missing or invalid
        if (!finalApiKeySid || !finalApiKeySecret || !finalApiKeySid.startsWith('SK')) {
            log("🔑 Creating new API Key for Voice SDK...");
            const key = await client.newKeys.create({ friendlyName: 'Dashboard Voice SDK' });
            finalApiKeySid = key.sid;
            finalApiKeySecret = key.secret;
        }

        const token = new AccessToken(accountSid, finalApiKeySid, finalApiKeySecret, {
            identity: req.query.identity || "browser_user"
        });

        const grant = new VoiceGrant({
            outgoingApplicationSid: twimlAppSid,
            incomingAllow: true,
        });

        token.addGrant(grant);

        res.json({
            success: true,
            token: token.toJwt(),
            apiKeySid: finalApiKeySid,
            apiKeySecret: finalApiKeySecret
        });
    } catch (error) {
        log("❌ Token generation failed:", error.message);
        res.status(500).json({ success: false, message: "Failed to generate token" });
    }
};


/* =======================
   HANDLE OUTGOING WEB CALL
======================= */
export const handleOutgoingCall = async (req, res) => {
    log("📞 OUTGOING WEB CALL HIT:", req.body);
    // These could come from req.body (Twilio dial parameters) or req.query (fixed TwiML App URL)
    const { To, accountSid, authToken, phoneNumber } = { ...req.query, ...req.body };

    const config = {
        accountSid: accountSid || process.env.TWILIO_ACCOUNT_SID,
        authToken: authToken || process.env.TWILIO_AUTH_TOKEN,
        phoneNumber: phoneNumber || process.env.TWILIO_PHONE_NUMBER
    };
    const response = new twilio.twiml.VoiceResponse();

    if (!config.accountSid || !config.authToken || !config.phoneNumber) {
        log("❌ Incomplete Twilio config in outgoing call (no .env fallback either)");
        response.say("Credentials missing in call configuration.");
        res.type("text/xml");
        return res.send(response.toString());
    }

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
        log(`🆔 Using Caller ID: ${config.phoneNumber}`);

        const dial = response.dial({
            callerId: config.phoneNumber,
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
        const { twilioConfig, phoneNumber, companyName, objective } = req.body;

        if (!twilioConfig || !twilioConfig.accountSid) {
            return res.status(400).json({
                success: false,
                message: "Twilio credentials required to start call.",
            });
        }

        if (!phoneNumber) {
            log("❌ phoneNumber missing");
            return res.status(400).json({
                success: false,
                message: "Phone number is required",
            });
        }

        log("📲 Creating Twilio call to:", phoneNumber);
        const encoded = encodeConfig(twilioConfig);

        const client = getTwilioClient(twilioConfig);
        const call = await client.calls.create({
            to: phoneNumber,
            from: twilioConfig.phoneNumber,
            url: `${SERVER_URL}/api/call/voice?conf=${encoded}`,
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
    const encoded = req.query.conf;
    const configFromUrl = decodeConfig(encoded);

    // Fallback if needed (though startCall usually provides this)
    const activeAccountSid = configFromUrl?.accountSid || process.env.TWILIO_ACCOUNT_SID;

    const state = getConversationState(callSid);
    const twiml = new twilio.twiml.VoiceResponse();

    // Initial greeting
    twiml.say({
        voice: "Polly.Joanna"
    }, `Hello, this is ${state.companyName}. I'm calling to ${state.objective}.`);

    // Gather speech input
    const gather = twiml.gather({
        input: "speech",
        action: `${SERVER_URL}/api/call/gather-response?conf=${encoded}`,
        timeout: 3,
        speechTimeout: "1.0",
        hints: "Muhammad, Ahmed, Ali, Khan, Pakistan, email, hotmail, gmail, outlook, at, dot, com",
    });

    gather.say({
        voice: "Polly.Joanna"
    }, "May I have your full name please?");

    // If no input, repeat
    twiml.say({
        voice: "Polly.Joanna"
    }, "I didn't catch that. Let me try again.");
    twiml.redirect(`${SERVER_URL}/api/call/voice?conf=${encoded}`);

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
            return handleNoInput(res, req.query.conf);
        }

        const state = getConversationState(callSid);
        const twiml = new twilio.twiml.VoiceResponse();
        const input = speechResult.toLowerCase().trim();
        const encoded = req.query.conf;

        // --- STATE MACHINE LOGIC ---
        if (state.stage === "NAME") {
            // Assume the whole result is the name or contains it
            state.name = speechResult.replace(/my name is|i am|this is/gi, "").trim();
            log("✅ Name captured:", state.name);

            state.stage = "PITCH";

            const gather = twiml.gather({
                input: "speech",
                action: `${SERVER_URL}/api/call/gather-response?conf=${encoded}`,
                timeout: 3,
                speechTimeout: "1.0",
                hints: "yes, yeah, sure, okay, ok, redesign, improve, interested",
            });

            gather.say({ voice: "Polly.Joanna" },
                `Okay ${state.name}, I am from ${state.companyName} and we are specifically calling to ${state.objective}. Would you be interested in that?`
            );

            twiml.say({ voice: "Polly.Joanna" }, `I didn't hear you clearly. Would you be interested to ${state.objective}?`);
            twiml.redirect(`${SERVER_URL}/api/call/gather-response?conf=${encoded}`);

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
const handleNoInput = (res, encoded) => {
    const twiml = new twilio.twiml.VoiceResponse();

    twiml.say({
        voice: "Polly.Joanna"
    }, "I didn't hear anything. Let me ask again.");

    const gather = twiml.gather({
        input: "speech",
        action: `${SERVER_URL}/api/call/gather-response?conf=${encoded}`,
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

export const streamRecording = async (req, res) => {
    try {
        const { recordingUrl } = req.query;
        if (!recordingUrl) {
            return res.status(400).send("Recording URL required");
        }

        // Validate that the URL is a Twilio URL to prevent SSRF
        if (!recordingUrl.includes("api.twilio.com")) {
            return res.status(400).send("Invalid URL");
        }

        // Append .mp3 if not present (Twilio defaults to .wav or .xml otherwise often)
        const mp3Url = recordingUrl.endsWith('.mp3') ? recordingUrl : `${recordingUrl}.mp3`;

        const authHeader = 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');

        const response = await fetch(mp3Url, {
            headers: { 'Authorization': authHeader }
        });

        if (!response.ok) {
            return res.status(response.status).send("Failed to fetch recording");
        }

        res.setHeader('Content-Type', 'audio/mpeg');

        // Convert Web Stream to Node Stream and pipe
        const { Readable } = await import('stream');
        Readable.fromWeb(response.body).pipe(res);

    } catch (error) {
        log("❌ Error streaming recording:", error);
        res.status(500).send("Internal Server Error");
    }
};

/* =======================
   RECORDING HANDLERS
======================= */
export const toggleRecording = async (req, res) => {
    try {
        let { callSid, action, accountSid, authToken, number } = req.body; // action: 'start' or 'stop'

        if (!callSid || !action) {
            return res.status(400).json({ success: false, message: "CallSid and action required" });
        }

        // Clean number immediately
        if (number) number = number.trim();

        const client = twilio(accountSid || process.env.TWILIO_ACCOUNT_SID, authToken || process.env.TWILIO_AUTH_TOKEN);

        if (action === 'start') {
            log(`⏺️ Starting recording for CallSid: ${callSid} (Number: ${number})`);
            const callbackUrl = `${process.env.SERVER_URL}/api/call/recording-status` + (number ? `?number=${encodeURIComponent(number)}` : '');

            const recording = await client.calls(callSid).recordings.create({
                recordingStatusCallback: callbackUrl,
                recordingStatusCallbackEvent: ['completed']
            });
            return res.json({ success: true, status: 'recording', recordingSid: recording.sid });
        }

        if (action === 'stop') {
            log(`⏹️ Stopping recording for CallSid: ${callSid}`);
            const recordings = await client.calls(callSid).recordings.list({ status: 'in-progress' });

            for (const r of recordings) {
                await client.calls(callSid).recordings(r.sid).update({ status: 'stopped' });
            }

            return res.json({ success: true, status: 'stopped' });
        }

        res.status(400).json({ success: false, message: "Invalid action" });

    } catch (error) {
        log("❌ Recording toggle error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const handleRecordingStatus = async (req, res) => {
    log("📼 RECORDING STATUS WEBHOOK:", req.body);
    const { CallSid, RecordingUrl, RecordingDuration, RecordingStatus } = req.body;
    let { number } = req.query; // Get number from query params if passed

    if (RecordingStatus === 'completed') {
        try {
            if (number) number = number.trim();

            // 1. Save to CallLog
            await CallLog.create({
                callSid: CallSid,
                status: 'completed',
                recordingUrl: RecordingUrl,
                duration: RecordingDuration,
                direction: 'outbound-api',
                to: number // Save number if available
            });
            log("✅ Recording saved to CallLog");

            // 2. Update ColdCall Campaign with Fuzzy Match
            if (number) {
                const clean = number.replace(/^\+/, '').replace(/\s+/g, '');
                // Create a regex that allows optional + and optional spaces, ending with the clean sequence
                // matches: "+92 310...", "92310...", "092310..." (if we want looser)
                // Let's stick to: matches the clean sequence at the end of the string

                const result = await ColdCall.updateMany(
                    {
                        "numbers.number": { $regex: clean, $options: 'i' }
                    },
                    {
                        $set: { "numbers.$.recordingUrl": RecordingUrl }
                    }
                );
                log(`✅ ColdCall updated with recording for ${number} (Matched: ${result.modifiedCount})`);
            }

        } catch (error) {
            log("❌ Error saving recording to DB:", error);
        }
    }

    res.sendStatus(200);
};