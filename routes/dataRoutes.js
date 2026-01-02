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
    bulkUpdateWhatsAppStatus
} from "../controller/dataController.js";

const dataRouter = express.Router();

dataRouter.post("/", createData);
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


export default dataRouter;