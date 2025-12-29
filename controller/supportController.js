import Support from "../models/supportSchema.js";

/**
 * Create a new support request
 */
export const createSupportRequest = async (req, res) => {
    try {
        const { firstName, lastName, subject, message } = req.body;
        const userId = req.user?._id || req.user?.id;

        // Validation
        if (!firstName || !lastName || !subject || !message) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        // Create support request
        const supportRequest = await Support.create({
            userId,
            firstName,
            lastName,
            subject,
            message,
            status: "pending"
        });

        return res.status(201).json({
            success: true,
            message: "Support request submitted successfully",
            data: supportRequest
        });

    } catch (error) {
        console.error("Error creating support request:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to submit support request",
            error: error.message
        });
    }
};

/**
 * Get all support requests for a user
 */
export const getUserSupportRequests = async (req, res) => {
    try {
        const userId = req.user?._id || req.user?.id;

        const supportRequests = await Support.find({ userId })
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            data: supportRequests
        });

    } catch (error) {
        console.error("Error fetching support requests:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch support requests",
            error: error.message
        });
    }
};

/**
 * Get all support requests (Admin only)
 */
export const getAllSupportRequests = async (req, res) => {
    try {
        const supportRequests = await Support.find()
            .populate('userId', 'name email')
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            data: supportRequests
        });

    } catch (error) {
        console.error("Error fetching all support requests:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch support requests",
            error: error.message
        });
    }
};

/**
 * Update support request status (Admin only)
 */
export const updateSupportStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!["pending", "in progress", "completed"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status value"
            });
        }

        const supportRequest = await Support.findByIdAndUpdate(
            id,
            { status },
            { new: true }
        );

        if (!supportRequest) {
            return res.status(404).json({
                success: false,
                message: "Support request not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Status updated successfully",
            data: supportRequest
        });

    } catch (error) {
        console.error("Error updating support status:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update status",
            error: error.message
        });
    }
};
