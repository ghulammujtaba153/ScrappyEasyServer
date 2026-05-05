import Blog from "../models/BlogsSchema.js";

// Get all blogs with pagination
export const getAllBlogs = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const total = await Blog.countDocuments();
        const blogs = await Blog.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.status(200).json({ 
            success: true, 
            data: blogs,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching blogs", error: error.message });
    }
};

// Get a single blog by ID
export const getBlogById = async (req, res) => {
    try {
        const { id } = req.params;
        const blog = await Blog.findById(id);
        if (!blog) {
            return res.status(404).json({ success: false, message: "Blog not found" });
        }
        res.status(200).json({ success: true, data: blog });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching blog", error: error.message });
    }
};

// Get a single blog by slug
export const getBlogBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        const blog = await Blog.findOne({ slug });
        if (!blog) {
            return res.status(404).json({ success: false, message: "Blog not found" });
        }
        res.status(200).json({ success: true, data: blog });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching blog", error: error.message });
    }
};

// Create a new blog
export const createBlog = async (req, res) => {
    try {
        const { title, content, date, slug } = req.body;
        if (!title || !content) {
            return res.status(400).json({ success: false, message: "Title and content are required" });
        }
        
        // Generate slug if not provided
        const finalSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        const newBlog = new Blog({
            title,
            slug: finalSlug,
            content,
            date: date || new Date().toISOString(),
        });
        
        await newBlog.save();
        res.status(201).json({ success: true, message: "Blog created successfully", data: newBlog });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error creating blog", error: error.message });
    }
};

// Update an existing blog
export const updateBlog = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, date, slug } = req.body;
        
        const updateData = { title, content, date };
        if (slug) updateData.slug = slug;

        const updatedBlog = await Blog.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );
        
        if (!updatedBlog) {
            return res.status(404).json({ success: false, message: "Blog not found" });
        }
        
        res.status(200).json({ success: true, message: "Blog updated successfully", data: updatedBlog });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error updating blog", error: error.message });
    }
};

// Delete a blog
export const deleteBlog = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedBlog = await Blog.findByIdAndDelete(id);
        
        if (!deletedBlog) {
            return res.status(404).json({ success: false, message: "Blog not found" });
        }
        
        res.status(200).json({ success: true, message: "Blog deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error deleting blog", error: error.message });
    }
};
