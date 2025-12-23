/* 
  ⚠️ DEPRECATED ⚠️
  This file and the WebSocket-based approach (Option 1) are no longer used.
  The project has switched to Option 2 (Text-based Voice Call):
  Twilio Speech-to-Text (<Gather>) → Gemini Text API → Twilio Text-to-Speech (<Say>)
  
  Please see server/controller/callController.js for the current implementation.
*/

import { WebSocketServer, WebSocket } from "ws";
import dotenv from "dotenv";
import { spawn } from "child_process";

dotenv.config();

/*
  Twilio  -> μ-law 8kHz (base64)
  Gemini  -> PCM Linear16 16kHz (base64)

  Audio-only Gemini Live implementation (NO text turns)
*/

const FFMPEG_PATH = "C:\\ffmpeg-8.0.1-full_build\\bin\\ffmpeg.exe";

export function setupMediaStream(server) {
    const wss = new WebSocketServer({
        server,
        path: "/media-stream",
    });

    wss.on("connection", (twilioWs) => {
        console.log("🔗 Twilio Media Stream connected");

        let geminiWs = null;
        let streamSid = null;

        /* =========================
           FFMPEG TRANSCODERS
        ========================= */

        // μ-law 8kHz → PCM16 16kHz (Twilio → Gemini)
        const toGemini = spawn(FFMPEG_PATH, [
            "-f", "mulaw",
            "-ar", "8000",
            "-ac", "1",
            "-i", "pipe:0",
            "-f", "s16le",
            "-ar", "16000",
            "-ac", "1",
            "pipe:1",
        ]);

        // PCM16 16kHz → μ-law 8kHz (Gemini → Twilio)
        const toTwilio = spawn(FFMPEG_PATH, [
            "-f", "s16le",
            "-ar", "16000",
            "-ac", "1",
            "-i", "pipe:0",
            "-f", "mulaw",
            "-ar", "8000",
            "-ac", "1",
            "pipe:1",
        ]);

        toGemini.on("error", (e) =>
            console.error("❌ FFmpeg toGemini error:", e)
        );
        toTwilio.on("error", (e) =>
            console.error("❌ FFmpeg toTwilio error:", e)
        );

        /* =========================
           CONNECT TO GEMINI LIVE
        ========================= */
        const connectToGemini = () => {
            const apiKey = process.env.GOOGLE_API_KEY;
            const model = "gemini-2.5-flash-native-audio-preview-12-2025";

            const url =
                "wss://generativelanguage.googleapis.com/ws/" +
                "google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent" +
                `?key=${apiKey}`;

            geminiWs = new WebSocket(url);

            geminiWs.on("open", () => {
                console.log("🤖 Gemini Live connected");

                /* ---------- SETUP ---------- */
                geminiWs.send(JSON.stringify({
                    setup: {
                        model: `models/${model}`,
                        generationConfig: {
                            responseModalities: ["AUDIO"],
                        },
                        systemInstruction: {
                            parts: [{
                                text: `
You are a professional AI phone assistant calling on behalf of Mative Inc.
You should greet the user and explain that you are calling to schedule a meeting.
Ask for the user's full name and email, one question at a time.
Speak clearly and naturally.
End the call politely after collecting both.
`
                            }]
                        }
                    }
                }));

                /* ---------- PRIME AUDIO TURN ---------- */
                sendSilenceToGemini(200);
                sendEndOfTurn();
            });

            /* =========================
               GEMINI → TWILIO AUDIO
            ========================= */
            geminiWs.on("message", (msg) => {
                try {
                    const data = JSON.parse(msg.toString());
                    const parts = data?.serverContent?.modelTurn?.parts || [];

                    for (const part of parts) {
                        if (part.inlineData?.data) {
                            const pcm = Buffer.from(part.inlineData.data, "base64");
                            toTwilio.stdin.write(pcm);
                        }
                    }
                } catch (err) {
                    console.error("❌ Gemini parse error:", err);
                }
            });

            geminiWs.on("close", () => {
                console.log("🤖 Gemini closed");
            });

            geminiWs.on("error", (err) => {
                console.error("❌ Gemini WS error:", err);
            });
        };

        /* =========================
           AUDIO HELPERS
        ========================= */

        const sendSilenceToGemini = (ms = 200) => {
            const samples = Math.floor((16000 * ms) / 1000);
            const buffer = Buffer.alloc(samples * 2); // PCM16 silence

            geminiWs.send(JSON.stringify({
                realtimeInput: {
                    mediaChunks: [{
                        mimeType: "audio/pcm",
                        data: buffer.toString("base64"),
                    }]
                }
            }));
        };

        const sendEndOfTurn = () => {
            geminiWs.send(JSON.stringify({
                realtimeInput: { endOfTurn: true }
            }));
        };

        /* =========================
           SEND AUDIO TO TWILIO
        ========================= */
        toTwilio.stdout.on("data", (chunk) => {
            if (!streamSid || twilioWs.readyState !== WebSocket.OPEN) return;

            twilioWs.send(JSON.stringify({
                event: "media",
                streamSid,
                media: {
                    payload: chunk.toString("base64"),
                },
            }));
        });

        /* =========================
           SEND AUDIO TO GEMINI
        ========================= */
        toGemini.stdout.on("data", (chunk) => {
            if (!geminiWs || geminiWs.readyState !== WebSocket.OPEN) return;

            geminiWs.send(JSON.stringify({
                realtimeInput: {
                    mediaChunks: [{
                        mimeType: "audio/pcm",
                        data: chunk.toString("base64"),
                    }]
                }
            }));
        });

        /* =========================
           TWILIO EVENTS
        ========================= */
        twilioWs.on("message", (msg) => {
            const data = JSON.parse(msg.toString());

            if (data.event === "start") {
                streamSid = data.start.streamSid;
                console.log("📞 Stream started:", streamSid);
                connectToGemini();
            }

            if (data.event === "media") {
                const mulaw = Buffer.from(data.media.payload, "base64");
                toGemini.stdin.write(mulaw);
            }

            if (data.event === "stop") {
                console.log("⏹️ Stream stopped");
                geminiWs?.close();
            }
        });

        /* =========================
           CLEANUP
        ========================= */
        twilioWs.on("close", () => {
            console.log("🔌 Twilio WS closed");
            geminiWs?.close();
            toGemini.kill();
            toTwilio.kill();
        });

        twilioWs.on("error", (err) => {
            console.error("❌ Twilio WS error:", err);
            geminiWs?.close();
            toGemini.kill();
            toTwilio.kill();
        });
    });
}
