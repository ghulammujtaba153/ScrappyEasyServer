import express from "express";
import cors from "cors";
import connectDB from "./database/db.js";
import dotenv from "dotenv";
import router from "./routes/index.js";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());


connectDB();

app.use("/api", router);

// Handle 404 for API routes
app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        message: `Endpoint not found: ${req.method} ${req.originalUrl}`
    });
});


// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || "Internal Server Error",
        error: process.env.NODE_ENV === "development" ? err : {}
    });
});

import whatsappService from "./services/whatsapp.service.js";

app.listen(process.env.PORT, async () => {
    console.log(`Server running on port ${process.env.PORT}`);

    try {
        console.log("Initializing default WhatsApp session...");
        const result = await whatsappService.initializeSession("default");
        if (result.success) {
            console.log("Default session initialized.");
        } else {
            console.error("Failed to initialize default session:", result.message);
        }
    } catch (error) {
        console.error("Failed to initialize default session:", error);
    }
});
