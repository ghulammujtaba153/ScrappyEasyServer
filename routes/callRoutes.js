import express from "express";
import { startCall, handleVoice, handleGather } from "../controller/callController.js";

const callRouter = express.Router();

callRouter.post("/start", startCall);
callRouter.post("/voice", handleVoice);
callRouter.post("/gather", handleGather);

export default callRouter;
