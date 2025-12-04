import Category from "../models/categorySchema.js";

export const createCategory = async (req, res) => {
    try {
        const category = await Category.create(req.body);
        res.status(201).json(category);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}


export const getAllCategories = async (req, res) => {
    try {
        const categories = await Category.find();
        res.status(200).json(categories);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}


export const getCategoryById = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        res.status(200).json(category);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

export const updateCategory = async (req, res) => {
    try {
        const category = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(category);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}


export const deleteCategory = async (req, res) => {
    try {
        const category = await Category.findByIdAndDelete(req.params.id);
        res.status(200).json(category);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}