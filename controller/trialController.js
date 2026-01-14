import Trial from "../models/trialSchema.js";
import Subscription from "../models/subscriptionSchema.js";

export const getTrialStatus = async (req, res) => {
    try {
        const userId = req.params.userId;

        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(startDate.getDate() + 1);

        // Atomic upsert to prevent E11000 race conditions
        let trial = await Trial.findOneAndUpdate(
            { user: userId },
            {
                $setOnInsert: {
                    user: userId,
                    startDate,
                    endDate,
                    status: 'Active'
                }
            },
            { upsert: true, new: true }
        );

        // Check if expired
        const now = new Date();
        const isActive = trial.status === 'Active' && now <= trial.endDate;

        if (!isActive && trial.status === 'Active') {
            trial.status = 'Expired';
            await trial.save();
        }

        res.status(200).json({ success: true, isAuthorized: isActive, trial });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error management trial", error: error.message });
    }
};

export const checkAccessStatus = async (req, res) => {
    try {
        const userId = req.params.userId;

        // 1. Check for Active Subscription
        const subscription = await Subscription.findOne({
            user: userId,
            status: 'Active'
        });

        if (subscription) {
            return res.status(200).json({
                success: true,
                isAuthorized: true,
                type: 'subscription',
                subscription
            });
        }

        // 2. Check for Active Trial
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(startDate.getDate() + 1);

        // Atomic upsert to prevent E11000 race conditions
        let trial = await Trial.findOneAndUpdate(
            { user: userId },
            {
                $setOnInsert: {
                    user: userId,
                    startDate,
                    endDate,
                    status: 'Active'
                }
            },
            { upsert: true, new: true }
        );

        const now = new Date();
        const isActive = trial.status === 'Active' && now <= trial.endDate;

        if (isActive === false && trial.status === 'Active') {
            trial.status = 'Expired';
            await trial.save();
        }

        res.status(200).json({
            success: true,
            isAuthorized: isActive,
            type: 'trial',
            trial
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Error checking access status", error: error.message });
    }
}
