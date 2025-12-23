import ColdCall from "../models/coldCallSchema.js";

// CREATE
export const createColdCall = async (req, res) => {
    try {
        const { userId, name, numbers } = req.body;

        if (!userId || !name || !numbers || !Array.isArray(numbers)) {
            return res.status(400).json({ success: false, message: "Missing required fields or invalid numbers format" });
        }

        // Format numbers if they are just strings
        const formattedNumbers = numbers.map(num => {
            if (typeof num === "string") {
                return { number: num, status: "pending" };
            }
            return num;
        });

        const newColdCall = new ColdCall({
            userId,
            name,
            numbers: formattedNumbers
        });

        await newColdCall.save();
        res.status(201).json({ success: true, data: newColdCall });
    } catch (error) {
        console.error("Error creating ColdCall:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// GET ALL FOR USER
export const getColdCallsByUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const coldCalls = await ColdCall.find({ userId }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: coldCalls });
    } catch (error) {
        console.error("Error fetching ColdCalls:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// GET BY ID
export const getColdCallById = async (req, res) => {
    try {
        const { id } = req.params;
        const coldCall = await ColdCall.findById(id);
        if (!coldCall) {
            return res.status(404).json({ success: false, message: "ColdCall list not found" });
        }
        res.status(200).json({ success: true, data: coldCall });
    } catch (error) {
        console.error("Error fetching ColdCall BY ID:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// UPDATE (Full update or status update)
export const updateColdCall = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, numbers } = req.body;

        const updateData = {};
        if (name) updateData.name = name;
        if (numbers) {
            // Ensure numbers are formatted correctly
            updateData.numbers = numbers.map(num => {
                if (typeof num === "string") {
                    return { number: num, status: "pending" };
                }
                return num;
            });
        }

        const updatedColdCall = await ColdCall.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true }
        );

        if (!updatedColdCall) {
            return res.status(404).json({ success: false, message: "ColdCall list not found" });
        }

        res.status(200).json({ success: true, data: updatedColdCall });
    } catch (error) {
        console.error("Error updating ColdCall:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// DELETE
export const deleteColdCall = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await ColdCall.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: "ColdCall list not found" });
        }
        res.status(200).json({ success: true, message: "ColdCall list deleted successfully" });
    } catch (error) {
        console.error("Error deleting ColdCall:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
