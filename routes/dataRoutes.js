import express from "express";
import { createData, getData, updateData, getPhoneNumbers, getAllUniqueStrings, appendDataEntries, getDataRecordById, updateCityData, updateScreenshotData, toggleFavorite } from "../controller/dataController.js";

const dataRouter = express.Router();

dataRouter.post("/", createData);
dataRouter.get("/phones/:userId", getPhoneNumbers);
dataRouter.get("/unique/:userId", getAllUniqueStrings);
dataRouter.get("/record/:recordId", getDataRecordById);
dataRouter.post("/:id/append", appendDataEntries);
dataRouter.put("/:id", updateData);
dataRouter.get("/:id", getData);
dataRouter.post("/update-city", updateCityData);
dataRouter.post("/update-screenshots", updateScreenshotData);
dataRouter.post("/toggle-favorite", toggleFavorite);


export default dataRouter;