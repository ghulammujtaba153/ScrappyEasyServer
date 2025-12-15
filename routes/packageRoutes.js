import express from "express";
import { createPackage, deletePackage, getAllPackages, updatePackage } from "../controller/packageController.js";

const packageRouter = express.Router();

packageRouter.post("/", createPackage);
packageRouter.get("/", getAllPackages);
packageRouter.put("/:id", updatePackage);
packageRouter.delete("/:id", deletePackage);

export default packageRouter;
