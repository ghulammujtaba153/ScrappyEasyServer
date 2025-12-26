import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";

import connectDB from "./database/db.js";
import router from "./routes/index.js";
import whatsappService from "./services/whatsapp.service.js";
// import { setupMediaStream } from "./utils/mediaStream.js"; // Disabled: using text-based voice approach

dotenv.config();

/* ======================
   APP & SERVER SETUP
====================== */
const app = express();
const server = http.createServer(app);

/* ======================
   MIDDLEWARE
====================== */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/screenshots", express.static("public/screenshots"));

import fs from 'fs';
import path from 'path';
const screenshotsDir = path.join(process.cwd(), 'public/screenshots');
if (!fs.existsSync(screenshotsDir)) {
   fs.mkdirSync(screenshotsDir, { recursive: true });
}

/* ======================
   DATABASE
====================== */
connectDB();

/* ======================
   ROUTES
====================== */
app.use("/api", router);

/* ======================
   404 HANDLER
====================== */
app.use("/api", (req, res) => {
   res.status(404).json({
      success: false,
      message: `Endpoint not found: ${req.method} ${req.originalUrl}`,
   });
});

/* ======================
   GLOBAL ERROR HANDLER
====================== */
app.use((err, req, res, next) => {
   console.error(err.stack);
   res.status(err.status || 500).json({
      success: false,
      message: err.message || "Internal Server Error",
      error: process.env.NODE_ENV === "development" ? err : {},
   });
});

/* ======================
   MEDIA STREAMS (Twilio)
   DISABLED: Switching to text-based voice approach
   (Speech-to-Text → Gemini → Text-to-Speech)
====================== */
// setupMediaStream(server);

/* ======================
   START SERVER
====================== */
const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
   console.log(`🚀 Server running on port ${PORT}`);

   // try {
   //     console.log("📲 Initializing default WhatsApp session...");
   //     const result = await whatsappService.initializeSession("default");

   //     if (result.success) {
   //         console.log("✅ Default WhatsApp session initialized.");
   //     } else {
   //         console.error("❌ WhatsApp init failed:", result.message);
   //     }
   // } catch (error) {
   //     console.error("❌ WhatsApp initialization error:", error);
   // }
});
