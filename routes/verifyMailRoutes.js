import { Router } from "express";
import { verifyEmail } from "../controller/verifyMailController.js";

const verifyMailRouter = Router();

verifyMailRouter.post('/verify-email', verifyEmail);

export default verifyMailRouter;