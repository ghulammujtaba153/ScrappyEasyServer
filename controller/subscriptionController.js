import Subscription from "../models/subscriptionSchema.js";
import User from "../models/userSchema.js";
import Package from "../models/packageSchema.js";

export const getAllSubscriptions = async (req, res) => {
    try {
        const subscriptions = await Subscription.find()
            .populate('user', 'name email')
            .populate('package', 'name interval')
            .sort({ createdAt: -1 });

        const formattedAuths = subscriptions.map(sub => ({
            id: sub._id,
            user: sub.user ? sub.user.name : "Unknown User",
            plan: sub.package ? sub.package.name : "Unknown Plan",
            amount: `$${sub.amount.toFixed(2)}`,
            status: sub.status,
            date: new Date(sub.startDate).toISOString().split('T')[0]
        }));

        res.status(200).json({ subscriptions: formattedAuths });
    } catch (error) {
        res.status(500).json({ message: "Error fetching subscriptions", error: error.message });
    }
};

export const createSubscription = async (req, res) => {
    try {
        const { userId, packageId, status, amount } = req.body;

        const newSubscription = new Subscription({
            user: userId,
            package: packageId,
            status,
            amount
        });

        await newSubscription.save();
        res.status(201).json({ message: "Subscription created", subscription: newSubscription });
    } catch (error) {
        res.status(500).json({ message: "Error creating subscription", error: error.message });
    }
};

export const getSubscriptionAnalytics = async (req, res) => {
    try {
        // 1. Status Distribution
        const statusDistribution = await Subscription.aggregate([
            { $group: { _id: "$status", value: { $sum: 1 } } },
            { $project: { name: "$_id", value: 1, _id: 0 } }
        ]);

        // 2. Revenue Trend (Last 6 Months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const revenueTrendRaw = await Subscription.aggregate([
            { $match: { createdAt: { $gte: sixMonthsAgo } } },
            {
                $group: {
                    _id: {
                        month: { $month: "$createdAt" },
                        year: { $year: "$createdAt" }
                    },
                    revenue: { $sum: "$amount" }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const revenueTrend = revenueTrendRaw.map(item => ({
            name: months[item._id.month - 1],
            revenue: item.revenue
        }));

        res.status(200).json({ statusDistribution, revenueTrend });
    } catch (error) {
        res.status(500).json({ message: "Error fetching analytics", error: error.message });
    }
};
