import express from "express";
import { createCategory, deleteCategory, getAllCategories, getCategoryById, updateCategory } from "../controller/categoryController.js";

const categoryRouter = express.Router();

categoryRouter.post("/", createCategory);
categoryRouter.get("/", getAllCategories);
categoryRouter.get("/:id", getCategoryById);
categoryRouter.put("/:id", updateCategory);
categoryRouter.delete("/:id", deleteCategory);

export default categoryRouter;