import mongoose from "mongoose";

const blogSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    slug: {
        type: String,
        required: true,
        unique: true,
    },
    content: {
        type: String,
        required: true,
    },
    date: {
        type: String,
        default: () => new Date().toISOString(),
    },
}, { timestamps: true });

const Blog = mongoose.model("Blog", blogSchema);

export default Blog;
