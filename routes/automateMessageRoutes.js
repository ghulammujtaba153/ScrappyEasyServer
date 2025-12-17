import express from "express"
import { create, deleteMessage, getAllAutomateMessages, update, sendBatch } from "../controller/automateMessageController.js";

const automateMessageRouter = express.Router();

automateMessageRouter.post(`/create`, create);
automateMessageRouter.post(`/send-batch`, sendBatch);
automateMessageRouter.get(`/all/:userId`, getAllAutomateMessages);
automateMessageRouter.put(`/update/:id`, update);
automateMessageRouter.delete(`/delete/:id`, deleteMessage);

export default automateMessageRouter