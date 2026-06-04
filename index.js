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
import Campaign from "./models/campaignSchema.js";
import { sendCampaignById } from "./controller/campaignController.js";
import cron from 'node-cron';
import setupSocketIO from "./services/socket.service.js";
// import { setupMediaStream } from "./utils/mediaStream.js"; // Disabled: using text-based voice approach
import dns from "node:dns/promises";
dns.setServers(["1.1.1.1"]); // Restored: Necessary for resolving MongoDB Atlas SRV records in some environments

dotenv.config();

// Cold email feature — background workers
await Promise.all([
  import('./workers/emailWorker.js'),
  import('./workers/trackingSyncWorker.js')
]);

/* ======================
   APP & SERVER SETUP
====================== */
const app = express();
const server = http.createServer(app);
server.timeout = 120000; // 120 seconds (2 minutes)
app.use(helmet());
app.set("trust proxy", 1);

// Define allowed origins for CORS
const allowedOrigins = [
   process.env.CLIENT_URL,
   'https://dashboard.mapharvest.live',
   'https://mapharvest.live',
   'http://localhost:5173',
   'http://localhost:3000',
   'http://localhost:5000',
   'http://127.0.0.1:5173',
   'http://127.0.0.1:3000',
   'http://127.0.0.1:5000'
].filter(Boolean);

const corsOptions = {
   origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
         callback(null, true);
      } else {
         console.warn(`Non-whitelisted origin requested: ${origin}`);
         callback(null, true);
      }
   },
   credentials: true,
   methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
   allowedHeaders: ["Content-Type", "Authorization", "x-active-team"],
   exposedHeaders: ["Authorization"],
   optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Explicit fallback CORS handler for API responses and preflight.
app.use((req, res, next) => {
   const origin = req.headers.origin;
   if (origin && allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-active-team');
   }
   if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
   }
   next();
});

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
  windowMs: 1 * 60 * 1000, // 1 minutes
  max: 200, // limit each IP to 100 requests per window
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
// Diagnostic middleware: log incoming requests to cold-campaigns endpoints (helps debug CORS/preflight)
app.use('/api/cold-campaigns', (req, res, next) => {
   try {
      console.log(`[CORS-TRACE] ${req.method} ${req.originalUrl} Origin:${req.headers.origin || '-'} Host:${req.headers.host || '-'} Remote:${req.ip || req.connection?.remoteAddress || '-'} Status:${req.socket?.destroyed ? 'socket-destroyed' : 'ok'}`);
      res.on('finish', () => {
         try {
            console.log(`[CORS-TRACE-RESPONSE] ${req.method} ${req.originalUrl} -> ${res.statusCode} Headers: ${JSON.stringify(res.getHeaders())}`);
         } catch (e) { }
      });
   } catch (e) { /* ignore logging errors */ }
   next();
});

// CORS middleware is already applied globally earlier via `app.use(cors(corsOptions))`.
// Remove explicit app.options() to avoid path-to-regexp errors in this environment.

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
   console.error("❌ GLOBAL ERROR:", err.message);
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

   /* ======================
      SCHEDULED CAMPAIGN SENDER (node-cron)
      Uses a cron expression to check for campaigns with `status: 'Scheduled'` and `scheduledAt <= now`.
      Runs every minute and triggers `sendCampaignById` for each due campaign.
   ====================== */

   const processScheduledCampaigns = async () => {
      try {
         const now = new Date();
         const due = await Campaign.find({ status: 'Scheduled', scheduledAt: { $lte: now } });
         if (due && due.length) {
            console.log(`Found ${due.length} scheduled campaign(s) due. Triggering sends...`);
            for (const camp of due) {
               // Fire and forget; sendCampaignById will set status to 'Sending'
               sendCampaignById(camp._id).catch(err => console.error('Scheduled send error:', err.message || err));
            }
         }
      } catch (error) {
         console.error('Error processing scheduled campaigns:', error.message || error);
      }
   };

   // Schedule job to run every minute using cron expression
   cron.schedule('*/1 * * * *', () => {
      processScheduledCampaigns().catch(err => console.error('Cron job error:', err.message || err));
   });

   // Run once at startup shortly after server starts
   setTimeout(processScheduledCampaigns, 5000);
