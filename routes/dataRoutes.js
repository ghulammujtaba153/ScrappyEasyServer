import express from "express";
import { createData, getData, updateData, getPhoneNumbers } from "../controller/dataController.js";

const dataRouter = express.Router();

dataRouter.post("/", createData);
dataRouter.get("/phones/:userId", getPhoneNumbers);
dataRouter.get("/:id", getData);
dataRouter.put("/:id", updateData);


export default dataRouter;