import Data from "../models/dataSchema.js"

export const createData = async (req, res) => {
    try {
        if (!req.body) {
            return res.status(400).json({ message: "Data is required" });
        }

        const newData = await Data.create(req.body);

        res.status(201).json({
            message: "Data saved successfully",
            data: newData
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

export const getData = async (req, res) => {
    try {
        if (req.params.id) {
            // Get data by userId
            const data = await Data.find({ userId: req.params.id });
            res.status(200).json(data);
        } else {
            // Get all data
            const data = await Data.find();
            res.status(200).json(data);
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const updateData = async (req, res) => {
    try {
        const data = await Data.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.status(200).json({
            message: "Data updated successfully",
            data
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}