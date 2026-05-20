import express from "express";
import multer from "multer";
import {
    createData,
    getData,
    updateData,
    deleteData,
    getPhoneNumbers,
    getAllUniqueStrings,
    appendDataEntries,
    getDataRecordById,
    updateCityData,
    updateScreenshotData,
    toggleFavorite,
    updateWhatsAppStatus,
    bulkUpdateWhatsAppStatus,
    updateLeadStatus,
    importCSVData,
    updateLead,
    deleteLead,
    updateEmailData,
    analyzeWebsitesForAds
} from "../controller/dataController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { resolveTeamContext } from "../middleware/contextMiddleware.js";

const dataRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// CSV bulk import endpoint
dataRouter.post("/import-csv", upload.single("file"), importCSVData);

// Public route for adding data (from scrapers)
dataRouter.post("/", createData);

// Apply authMiddleware and resolveTeamContext to remaining routes in this router
dataRouter.use(authMiddleware);
dataRouter.use(resolveTeamContext);

dataRouter.get("/phones/:userId", getPhoneNumbers);
dataRouter.get("/unique/:userId", getAllUniqueStrings);
dataRouter.get("/record/:recordId", getDataRecordById);
dataRouter.post("/:id/append", appendDataEntries);
dataRouter.put("/:id", updateData);
dataRouter.delete("/:id", deleteData);
dataRouter.get("/:id", getData);
dataRouter.post("/update-city", updateCityData);
dataRouter.post("/update-screenshots", updateScreenshotData);
dataRouter.post("/toggle-favorite", toggleFavorite);
dataRouter.post("/update-whatsapp-status", updateWhatsAppStatus);
dataRouter.post("/update-lead-status", updateLeadStatus);
dataRouter.put("/lead/:leadId", updateLead);
dataRouter.delete("/lead/:leadId", deleteLead);
dataRouter.post("/update-emails", updateEmailData);

dataRouter.post("/analyze-websites-for-ads", analyzeWebsitesForAds);

export default dataRouter;