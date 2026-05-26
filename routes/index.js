import express from "express";
import authRouter from "./authRoutes.js";
import otpRouter from "./otpRoutes.js";
import dataRouter from "./dataRoutes.js";
import categoryRouter from "./categoryRoutes.js";
// import whatsappRouter from "./whatsappRoutes.js";
import verificationRouter from "./whatsAppVerificationRoutes.js";
import notesRouter from "./notesRoutes.js";
import dashboardRouter from "./dashboardRoutes.js";
import adminDashboardRouter from "./adminDashboardRoutes.js";
import automationRouter from "./automationRoutes.js";
import whatsAppAccountRouter from "./whatsAppAccountRoutes.js";
import wappRouter from "./whatsapp.routes.js";

import wappMessageRouter from "./messageRoutes.js";
import automateMessageRouter from "./automateMessageRoutes.js";
import callRouter from "./callRoutes.js";
import coldCallRouter from "./coldCallRoutes.js";
import userRouter from "./userRoutes.js";
import screenshotRouter from "./screenshotRoutes.js";
import proxyRouter from "./proxyRoutes.js";
import supportRouter from "./supportRoutes.js";
import locationRouter from "./locationRoutes.js";
import collaborationRouter from "./collaborationRoutes.js";
import qualifiedLeadsRouter from "./qualifiedLeadsRoutes.js";
import teamRouter from "./teamRoutes.js";
import teamDataRouter from "./teamDataRoutes.js";
import notificationRouter from "./notificationRoutes.js";
import mailRouter from "./mailRoutes.js";
import mailMessageRouter from "./mailMessageRoutes.js";
import socialMediaRouter from "./socialMediaRoutes.js";
import campaignRouter from "./campaignRoutes.js";
import teamNotesRouter from "./teamNotesRoutes.js";
import blogRouter from "./blogRoutes.js";
import stackAnalysisRouter from "./stackAnalysisRoutes.js";
import offersRouter from "./offersRoutes.js";


const router = express.Router();

router.use("/auth", authRouter);
router.use("/otp", otpRouter);
router.use("/data", dataRouter);
router.use("/category", categoryRouter);
// router.use("/whatsapp", whatsappRouter);
router.use("/verification", verificationRouter)
router.use("/notes", notesRouter)
router.use("/dashboard", dashboardRouter)
router.use("/admin-dashboard", adminDashboardRouter)
router.use("/automation", automationRouter);
router.use("/whatsapp/account", whatsAppAccountRouter);
router.use("/whatsapp", wappRouter);

router.use("/message", wappMessageRouter);
router.use("/automate", automateMessageRouter);
router.use("/call", callRouter)
router.use("/coldcall", coldCallRouter);
router.use("/user", userRouter);
router.use("/screenshot", screenshotRouter);
router.use("/proxy", proxyRouter);
router.use("/support", supportRouter);
router.use("/location", locationRouter);
router.use("/collaboration", collaborationRouter);
router.use("/qualified-leads", qualifiedLeadsRouter);
router.use("/team", teamRouter);
router.use("/team-data", teamDataRouter);
router.use("/notifications", notificationRouter);
router.use("/mailautomation", mailRouter);
router.use("/mails", mailMessageRouter);
router.use("/social-media", socialMediaRouter);
router.use("/campaigns", campaignRouter);
router.use("/team-notes", teamNotesRouter);
router.use("/blog", blogRouter);
router.use("/stack-analysis", stackAnalysisRouter);
router.use("/offers", offersRouter);


export default router;
