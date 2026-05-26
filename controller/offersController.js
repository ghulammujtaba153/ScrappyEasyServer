import Offer from "../models/offersSchema.js";

/**
 * Create a new offer
 */
export const createOffer = async (req, res) => {
    try {
        const { name, description } = req.body;
        const userId = req.user?._id || req.user?.id;

        // Validation
        if (!name || !description) {
            return res.status(400).json({
                success: false,
                message: "Name and description are required"
            });
        }

        // Create offer
        const offer = await Offer.create({
            userId,
            name,
            description,
            activities: [],
            status: "active"
        });

        return res.status(201).json({
            success: true,
            message: "Offer created successfully",
            data: offer
        });

    } catch (error) {
        console.error("Error creating offer:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to create offer",
            error: error.message
        });
    }
};

/**
 * Get all offers for a user
 */
export const getUserOffers = async (req, res) => {
    try {
        const userId = req.user?._id || req.user?.id;

        // Pagination params
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.max(parseInt(req.query.limit) || 12, 1);
        const skip = (page - 1) * limit;

        const [offers, total] = await Promise.all([
            Offer.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Offer.countDocuments({ userId })
        ]);

        const totalPages = Math.ceil(total / limit) || 1;

        return res.status(200).json({
            success: true,
            data: offers,
            meta: {
                total,
                page,
                limit,
                totalPages
            }
        });

    } catch (error) {
        console.error("Error fetching user offers:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch offers",
            error: error.message
        });
    }
};

/**
 * Get single offer by ID
 */
export const getOfferById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?._id || req.user?.id;

        const offer = await Offer.findById(id);

        if (!offer) {
            return res.status(404).json({
                success: false,
                message: "Offer not found"
            });
        }

        // Check if user owns the offer
        if (offer.userId.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: "Unauthorized to access this offer"
            });
        }

        // Ensure activities are returned in sequence order
        if (offer.activities && offer.activities.length) {
            offer.activities.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
        }

        return res.status(200).json({
            success: true,
            data: offer
        });

    } catch (error) {
        console.error("Error fetching offer:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch offer",
            error: error.message
        });
    }
};

/**
 * Update offer (name, description, status)
 */
export const updateOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, status } = req.body;
        const userId = req.user?._id || req.user?.id;

        const offer = await Offer.findById(id);

        if (!offer) {
            return res.status(404).json({
                success: false,
                message: "Offer not found"
            });
        }

        // Check if user owns the offer
        if (offer.userId.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: "Unauthorized to update this offer"
            });
        }

        // Update fields
        if (name) offer.name = name;
        if (description) offer.description = description;
        if (status && ["active", "inactive", "completed"].includes(status)) {
            offer.status = status;
        }
        offer.updatedAt = Date.now();

        const updatedOffer = await offer.save();

        return res.status(200).json({
            success: true,
            message: "Offer updated successfully",
            data: updatedOffer
        });

    } catch (error) {
        console.error("Error updating offer:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update offer",
            error: error.message
        });
    }
};

/**
 * Add activity to offer
 */
export const addActivity = async (req, res) => {
    try {
        const { id } = req.params;
        const { text, notes } = req.body;
        const userId = req.user?._id || req.user?.id;

        // Validation
        if (!text) {
            return res.status(400).json({
                success: false,
                message: "Activity text is required"
            });
        }

        const offer = await Offer.findById(id);

        if (!offer) {
            return res.status(404).json({
                success: false,
                message: "Offer not found"
            });
        }

        // Check if user owns the offer
        if (offer.userId.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: "Unauthorized to add activity to this offer"
            });
        }

        // Determine sequence (append to end)
        const sequence = (offer.activities && offer.activities.length) ? offer.activities.length + 1 : 1;

        // Add activity
        const activity = {
            text,
            notes: notes || '',
            sequence,
            date: new Date()
        };

        offer.activities.push(activity);
        offer.updatedAt = Date.now();

        const updatedOffer = await offer.save();

        return res.status(200).json({
            success: true,
            message: "Activity added successfully",
            data: updatedOffer
        });

    } catch (error) {
        console.error("Error adding activity:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to add activity",
            error: error.message
        });
    }
};

/**
 * Update activity in offer
 */
export const updateActivity = async (req, res) => {
    try {
        const { id, activityId } = req.params;
        const { text, notes, sequence } = req.body;
        const userId = req.user?._id || req.user?.id;

        const offer = await Offer.findById(id);

        if (!offer) {
            return res.status(404).json({
                success: false,
                message: "Offer not found"
            });
        }

        // Check if user owns the offer
        if (offer.userId.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: "Unauthorized to update activity"
            });
        }

        // Find and update activity
        const activity = offer.activities.id(activityId);

        if (!activity) {
            return res.status(404).json({
                success: false,
                message: "Activity not found"
            });
        }

        if (text) activity.text = text;
        if (notes !== undefined) activity.notes = notes;
        if (sequence !== undefined) activity.sequence = sequence;

        offer.updatedAt = Date.now();
        const updatedOffer = await offer.save();

        return res.status(200).json({
            success: true,
            message: "Activity updated successfully",
            data: updatedOffer
        });

    } catch (error) {
        console.error("Error updating activity:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update activity",
            error: error.message
        });
    }
};

/**
 * Delete activity from offer
 */
export const deleteActivity = async (req, res) => {
    try {
        const { id, activityId } = req.params;
        const userId = req.user?._id || req.user?.id;

        const offer = await Offer.findById(id);

        if (!offer) {
            return res.status(404).json({
                success: false,
                message: "Offer not found"
            });
        }

        // Check if user owns the offer
        if (offer.userId.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: "Unauthorized to delete activity"
            });
        }

        // Remove activity by matching its _id or id string directly
        const activityIndex = offer.activities.findIndex((act) => {
            const actId = act._id?.toString() || act.id?.toString();
            return actId === activityId?.toString();
        });

        if (activityIndex === -1) {
            return res.status(404).json({ success: false, message: 'Activity not found' });
        }

        offer.activities.splice(activityIndex, 1);

        // Re-sequence remaining activities in order
        offer.activities = offer.activities.map((act, idx) => {
            act.sequence = idx + 1;
            return act;
        });

        offer.updatedAt = Date.now();

        const updatedOffer = await offer.save();

        return res.status(200).json({
            success: true,
            message: "Activity deleted successfully",
            data: updatedOffer
        });

    } catch (error) {
        console.error("Error deleting activity:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete activity",
            error: error.message
        });
    }
};

/**
 * Delete offer
 */
export const deleteOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?._id || req.user?.id;

        const offer = await Offer.findById(id);

        if (!offer) {
            return res.status(404).json({
                success: false,
                message: "Offer not found"
            });
        }

        // Check if user owns the offer
        if (offer.userId.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: "Unauthorized to delete this offer"
            });
        }

        await Offer.findByIdAndDelete(id);

        return res.status(200).json({
            success: true,
            message: "Offer deleted successfully"
        });

    } catch (error) {
        console.error("Error deleting offer:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete offer",
            error: error.message
        });
    }
};
