import express from "express"
import { create, deleteMessage, getAllAutomateMessages, update, sendBatch, sendSingleMessage, sendBatchWithLimit, getRemainingMessages } from "../controller/automateMessageController.js";

const automateMessageRouter = express.Router();

automateMessageRouter.post(`/create`, create);
automateMessageRouter.post(`/send-batch`, sendBatch);
automateMessageRouter.post(`/send-single`, sendSingleMessage);
automateMessageRouter.post(`/send-batch-limit`, sendBatchWithLimit);
automateMessageRouter.get(`/remaining/:userId`, getRemainingMessages);
automateMessageRouter.get(`/all/:userId`, getAllAutomateMessages);
automateMessageRouter.put(`/update/:id`, update);
automateMessageRouter.delete(`/delete/:id`, deleteMessage);

export default automateMessageRouter