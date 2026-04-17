import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import fs from 'fs';
import path from 'path';
import connectDB from "./database/db.js";
import router from "./routes/index.js";
import whatsappController from "./controller/whatsAppVerification.js";
import setupSocketIO from "./services/socket.service.js";
// import { setupMediaStream } from "./utils/mediaStream.js"; // Disabled: using text-based voice approach

dotenv.config();

/* ======================
   APP & SERVER SETUP
====================== */
const app = express();
const server = http.createServer(app);
server.timeout = 30000; // 30 seconds
app.use(helmet());
app.set("trust proxy", 1);

// Define allowed origins for CORS
const allowedOrigins = [
   'http://localhost:5173',
   'http://localhost:3000',
   'http://localhost:5000',
   'http://127.0.0.1:5173',
   'http://127.0.0.1:3000',
   'http://127.0.0.1:5000',
   process.env.CLIENT_URL
].filter(Boolean);

/* ======================
   MIDDLEWARE
====================== */
app.use(cors({
   origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
         callback(null, true);
      } else {
         console.warn(`Non-whitelisted origin requested: ${origin}`);
         callback(null, true); // Still allow for development flexibility
      }
   },
   credentials: true,
   methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
   allowedHeaders: ["Content-Type", "Authorization", "x-active-team"]
}));

// CORS middleware handles preflight requests automatically
app.use(express.json({
    limit: '50mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use("/screenshots", express.static("public/screenshots"));


const screenshotsDir = path.join(process.cwd(), 'public/screenshots');
if (!fs.existsSync(screenshotsDir)) {
   fs.mkdirSync(screenshotsDir, { recursive: true });
}

/* ======================
   DATABASE
====================== */
connectDB();

/* ======================
   SOCKET.IO SETUP
====================== */
const io = setupSocketIO(server);


const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 100 requests per window
  message: {
    success: false,
    message: "Too many requests from this IP, please try again after 15 minutes."
  }
});

app.use("/api", limiter);

/* ======================
   HEALTH CHECK ROUTES
====================== */
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "OK",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "API",
    status: "Healthy",
    uptime: process.uptime(),
  });
});

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

   try {
       console.log("📲 Restoring WhatsApp sessions...");
       
       // Add a 20-second timeout to prevent startup hangs
       const restorationTimeout = new Promise((_, reject) => 
           setTimeout(() => reject(new Error("Restoration timed out after 20s")), 20000)
       );

       await Promise.race([
           whatsappController.initAllSessions(),
           restorationTimeout
       ]);
       console.log("✅ WhatsApp sessions restored (or skipped if timeout)");
   } catch (error) {
       console.error("❌ WhatsApp auto-restoration issue:", error.message || error);
   }
});
