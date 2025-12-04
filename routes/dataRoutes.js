import express from "express";
import { createData, getData, updateData } from "../controller/dataController.js";

const dataRouter = express.Router();

dataRouter.post("/", createData);
dataRouter.get("/:id", getData);
dataRouter.put("/:id", updateData);


export default dataRouter;