import express from "express";
import {
    startCall,
    handleVoice,
    handleGatherResponse,
    handleGather,
    getVoiceToken,
    handleOutgoingCall
} from "../controller/callController.js";

const callRouter = express.Router();

callRouter.post("/start", startCall);
callRouter.post("/voice", handleVoice);
callRouter.post("/gather-response", handleGatherResponse);
callRouter.post("/gather", handleGather); // Deprecated, kept for compatibility
callRouter.get("/token", getVoiceToken);
callRouter.post("/outgoing", handleOutgoingCall);

export default callRouter;
