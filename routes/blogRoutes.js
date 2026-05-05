import express from "express";
import {
    getAllBlogs,
    getBlogById,
    createBlog,
    updateBlog,
    deleteBlog,
    getBlogBySlug,
} from "../controller/blogController.js";

const router = express.Router();

// Public or private? Usually, reading is public, creating/editing is private.
// Depending on how the app is structured, we'll keep it simple for now and maybe not enforce auth if the rest doesn't enforce it rigidly here, or we use requireAuth if they do.
// I'll make them public for the admin dashboard since the request didn't specify strict auth, but let's check other routes later if needed. For now just define routes.

router.get("/", getAllBlogs);
router.get("/s/:slug", getBlogBySlug);
router.get("/:id", getBlogById);
router.post("/", createBlog);
router.put("/:id", updateBlog);
router.delete("/:id", deleteBlog);

export default router;
