import express from "express";
import { sendWhatsAppMessage } from "../controller/automationController.js";

const automationRouter = express.Router();

automationRouter.post("/send", sendWhatsAppMessage);



export default automationRouter;