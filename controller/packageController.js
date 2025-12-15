import Package from "../models/packageSchema.js";

export const createPackage = async (req, res) => {
    try {
        const newPackage = await Package.create(req.body);
        res.status(201).json({ package: newPackage, message: "Package created successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getAllPackages = async (req, res) => {
    try {
        const packages = await Package.find({}).sort({ createdAt: -1 });
        res.status(200).json({ packages });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const updatePackage = async (req, res) => {
    try {
        const updatedPackage = await Package.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        if (!updatedPackage) {
            return res.status(404).json({ message: "Package not found" });
        }
        res.status(200).json({ package: updatedPackage, message: "Package updated successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deletePackage = async (req, res) => {
    try {
        const deletedPackage = await Package.findByIdAndDelete(req.params.id);
        if (!deletedPackage) {
            return res.status(404).json({ message: "Package not found" });
        }
        res.status(200).json({ message: "Package deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
