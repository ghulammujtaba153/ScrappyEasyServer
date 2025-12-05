// controllers/whatsappController.js
import Data from "../models/dataSchema.js";
import { v4 as uuidv4 } from "uuid";
import { initializeWhatsApp, verifyNumbers, getAuthStatus, closeWhatsApp } from "../services/whatsappVerification.js";

// Stores all running verification sessions
const sessions = new Map();

/* -------------------------------------------------------
   INITIALIZE WHATSAPP (ONE-TIME SETUP)
------------------------------------------------------- */
export const initialize = async (req, res) => {
    try {
        console.log("[Controller] Initializing WhatsApp...");

        const result = await initializeWhatsApp();

        res.status(result.success ? 200 : 500).json(result);

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

/* -------------------------------------------------------
   GET WHATSAPP STATUS
------------------------------------------------------- */
export const getStatus = (req, res) => {
    try {
        const status = getAuthStatus();
        res.status(200).json({
            success: true,
            ...status
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

/* -------------------------------------------------------
   START VERIFICATION SESSION (BACKEND DOES THE WORK)
------------------------------------------------------- */
export const startVerification = async (req, res) => {
    try {
        const { userId } = req.params;

        console.log("[Controller] Starting verification for user:", userId);

        // Check if WhatsApp is initialized
        const { isAuthenticated } = getAuthStatus();
        if (!isAuthenticated) {
            return res.status(400).json({
                success: false,
                message: "WhatsApp not initialized. Please call /initialize first."
            });
        }

        // Get phone numbers from database
        const userData = await Data.find({ userId });

        const numbers = userData.flatMap(record =>
            (record.data || [])
                .filter(item => item.phone)
                .map(item => item.phone.trim())
        );

        const uniquePhones = [...new Set(numbers)];

        if (uniquePhones.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No phone numbers found"
            });
        }

        // Create new verification session
        const sessionId = uuidv4();

        sessions.set(sessionId, {
            total: uniquePhones.length,
            processed: 0,
            verified: 0,
            notVerified: 0,
            results: [],
            status: "processing",
            numbers: uniquePhones
        });

        console.log("[Controller] Session created:", sessionId);

        // Send immediate response
        res.status(200).json({
            success: true,
            sessionId,
            total: uniquePhones.length,
            message: "Verification started in background"
        });

        // Start verification in background
        verifyInBackground(sessionId, uniquePhones);

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

/* -------------------------------------------------------
   BACKGROUND VERIFICATION WORKER
------------------------------------------------------- */
async function verifyInBackground(sessionId, numbers) {
    try {
        console.log(`[Worker] Starting verification for session ${sessionId}`);

        const results = await verifyNumbers(numbers, (progress) => {
            // Update session progress
            const session = sessions.get(sessionId);
            if (session) {
                session.processed = progress.processed;
                sessions.set(sessionId, session);
            }
        });

        // Update final results
        const session = sessions.get(sessionId);
        if (session) {
            session.results = results;
            session.processed = results.length;
            session.verified = results.filter(r => r.exists).length;
            session.notVerified = results.filter(r => !r.exists).length;
            session.status = "completed";
            sessions.set(sessionId, session);

            console.log(`[Worker] Session ${sessionId} completed:`, {
                total: results.length,
                verified: session.verified,
                notVerified: session.notVerified
            });
        }

    } catch (error) {
        console.error(`[Worker] Error in session ${sessionId}:`, error.message);

        const session = sessions.get(sessionId);
        if (session) {
            session.status = "error";
            session.error = error.message;
            sessions.set(sessionId, session);
        }
    }
}

/* -------------------------------------------------------
   GET PROGRESS (Frontend polls this)
------------------------------------------------------- */
export const getVerificationProgress = async (req, res) => {
    try {
        const { sessionId } = req.params;

        const session = sessions.get(sessionId);

        if (!session) {
            return res.status(404).json({
                success: false,
                message: "Session not found"
            });
        }

        res.status(200).json({
            success: true,
            ...session
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

/* -------------------------------------------------------
   CLEAR SESSION
------------------------------------------------------- */
export const clearSession = (req, res) => {
    try {
        const { sessionId } = req.params;

        sessions.delete(sessionId);

        res.status(200).json({
            success: true,
            message: "Session cleared"
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

/* -------------------------------------------------------
   CLOSE WHATSAPP BROWSER
------------------------------------------------------- */
export const closeBrowser = async (req, res) => {
    try {
        await closeWhatsApp();

        res.status(200).json({
            success: true,
            message: "WhatsApp browser closed"
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};
