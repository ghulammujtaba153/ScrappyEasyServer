import express from "express";
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
    updateLeadStatus
} from "../controller/dataController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { resolveTeamContext } from "../middleware/contextMiddleware.js";

const dataRouter = express.Router();

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
dataRouter.post("/bulk-update-whatsapp-status", bulkUpdateWhatsAppStatus);
dataRouter.post("/update-lead-status", updateLeadStatus);


export default dataRouter;