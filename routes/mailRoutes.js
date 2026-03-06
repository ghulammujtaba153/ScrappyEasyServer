import express from "express";
import { extractEmailsValidation, extractEmails } from "../controller/mailController.js";


const router = express.Router();

router.post("/extract", extractEmailsValidation, extractEmails);

export default router;
