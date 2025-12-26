import express from "express";
import {
    startCall,
    handleVoice,
    handleGatherResponse,
    handleGather,
    handleOutgoingCall,
    fetchTwilioNumbers,
    verifyTwilioAccount,
    getVoiceToken,
    toggleRecording,
    handleRecordingStatus,
    streamRecording // Import streamRecording
} from "../controller/callController.js";

const callRouter = express.Router();

callRouter.post("/start", startCall);
callRouter.post("/voice", handleVoice);
callRouter.post("/gather-response", handleGatherResponse);
callRouter.post("/gather", handleGather);
callRouter.post("/outgoing", handleOutgoingCall);
callRouter.post("/fetch-data", fetchTwilioNumbers);

// 🆕 Restoration: Adding missing setup endpoints
callRouter.post("/verify", verifyTwilioAccount);
callRouter.get("/token", getVoiceToken);

// 📼 Recording Endpoints
callRouter.post("/recording/toggle", toggleRecording);
callRouter.post("/recording-status", handleRecordingStatus);
callRouter.get("/recording-stream", streamRecording); // New Proxy Route

export default callRouter;