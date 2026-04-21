import User from "../models/userSchema.js";
import Data from "../models/dataSchema.js";


// Get dashboard overview stats
export const getAdminDashboardStats = async (req, res) => {
    try {
        // Total Users
        const totalUsers = await User.countDocuments();

        // New users this month
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const newUsersThisMonth = await User.countDocuments({ createdAt: { $gte: startOfMonth } });

        // Previous month users for comparison
        const startOfLastMonth = new Date(startOfMonth);
        startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);
        const usersLastMonth = await User.countDocuments({
            createdAt: { $gte: startOfLastMonth, $lt: startOfMonth }
        });
        const userGrowthPercent = usersLastMonth > 0
            ? Math.round(((newUsersThisMonth - usersLastMonth) / usersLastMonth) * 100)
            : 100;

        // Total Revenue (Sum of planAmount from all active users)
        const revenueResult = await User.aggregate([
            { $match: { status: 'active', planAmount: { $exists: true } } },
            { $group: { _id: null, total: { $sum: { $convert: { input: { $replaceAll: { input: "$planAmount", find: "$", replacement: "" } }, to: "double", onError: 0, onNull: 0 } } } } }
        ]);
        const totalRevenue = revenueResult[0]?.total || 0;


        // Revenue this month (Users who upgraded/registered this month)
        const revenueThisMonth = await User.aggregate([
            { $match: { createdAt: { $gte: startOfMonth }, status: 'active', planAmount: { $exists: true } } },
            { $group: { _id: null, total: { $sum: { $convert: { input: { $replaceAll: { input: "$planAmount", find: "$", replacement: "" } }, to: "double", onError: 0, onNull: 0 } } } } }
        ]);
        const monthlyRevenue = revenueThisMonth[0]?.total || 0;


        // Revenue last month for comparison
        const revenueLastMonth = await User.aggregate([
            { $match: { createdAt: { $gte: startOfLastMonth, $lt: startOfMonth }, status: 'active', planAmount: { $exists: true } } },
            { $group: { _id: null, total: { $sum: { $convert: { input: { $replaceAll: { input: "$planAmount", find: "$", replacement: "" } }, to: "double", onError: 0, onNull: 0 } } } } }
        ]);
        const lastMonthRevenue = revenueLastMonth[0]?.total || 0;

        const revenueGrowthPercent = lastMonthRevenue > 0
            ? Math.round(((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
            : 100;

        // Active Subscriptions
        const activeSubscriptions = await User.countDocuments({ status: 'active', planId: { $exists: true } });

        // Subscriptions last month
        const subscriptionsLastMonth = await User.countDocuments({
            createdAt: { $gte: startOfLastMonth, $lt: startOfMonth },
            status: 'active',
            planId: { $exists: true }
        });
        const subscriptionsThisMonth = await User.countDocuments({
            createdAt: { $gte: startOfMonth },
            status: 'active',
            planId: { $exists: true }
        });
        const subscriptionGrowthPercent = subscriptionsLastMonth > 0
            ? Math.round(((subscriptionsThisMonth - subscriptionsLastMonth) / subscriptionsLastMonth) * 100)
            : (subscriptionsThisMonth > 0 ? 100 : 0);

        // Active Users (users with status active and a plan)
        const activeUserCount = await User.countDocuments({ status: 'active', planId: { $exists: true } });


        res.status(200).json({
            stats: {
                totalUsers,
                userGrowthPercent,
                totalRevenue,
                revenueGrowthPercent,
                activeSubscriptions,
                subscriptionGrowthPercent,
                activeUserCount
            }
        });
    } catch (error) {
        console.error("Error fetching admin dashboard stats:", error);
        res.status(500).json({ message: "Error fetching dashboard stats", error: error.message });
    }
};

// Get user growth chart data
export const getUserGrowthData = async (req, res) => {
    try {
        const { period = 'monthly' } = req.query;
        let months = 6;

        if (period === 'weekly') months = 2;
        else if (period === 'yearly') months = 12;

        const data = [];
        const now = new Date();

        for (let i = months - 1; i >= 0; i--) {
            const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

            const totalUsers = await User.countDocuments({ createdAt: { $lte: endDate } });
            const newUsers = await User.countDocuments({
                createdAt: { $gte: startDate, $lte: endDate }
            });

            const monthName = startDate.toLocaleString('default', { month: 'short' });
            data.push({
                name: monthName,
                users: totalUsers,
                newUsers: newUsers
            });
        }

        res.status(200).json({ data });
    } catch (error) {
        console.error("Error fetching user growth data:", error);
        res.status(500).json({ message: "Error fetching user growth data", error: error.message });
    }
};

// Get revenue chart data
export const getRevenueData = async (req, res) => {
    try {
        const { period = 'monthly' } = req.query;
        let months = 6;

        if (period === 'weekly') months = 2;
        else if (period === 'yearly') months = 12;

        const data = [];
        const now = new Date();

        for (let i = months - 1; i >= 0; i--) {
            const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

            const revenueResult = await User.aggregate([
                { $match: { createdAt: { $gte: startDate, $lte: endDate }, status: 'active', planAmount: { $exists: true } } },
                { $group: { _id: null, total: { $sum: { $convert: { input: { $replaceAll: { input: "$planAmount", find: "$", replacement: "" } }, to: "double", onError: 0, onNull: 0 } } } } }
            ]);

            const monthName = startDate.toLocaleString('default', { month: 'short' });
            const revenue = revenueResult[0]?.total || 0;


            data.push({
                name: monthName,
                revenue: revenue,
                expenses: Math.round(revenue * 0.3) // Estimated expenses as 30% of revenue
            });
        }

        res.status(200).json({ data });
    } catch (error) {
        console.error("Error fetching revenue data:", error);
        res.status(500).json({ message: "Error fetching revenue data", error: error.message });
    }
};

// Get subscription distribution by package
export const getSubscriptionDistribution = async (req, res) => {
    try {
        const distribution = await User.aggregate([
            { $match: { status: 'active', planId: { $exists: true } } },
            { $group: { _id: "$planName", value: { $sum: 1 } } },
            {
                $project: {
                    name: "$_id",
                    value: 1,
                    _id: 0
                }
            }
        ]);


        // Add colors for each plan
        const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
        const dataWithColors = distribution.map((item, index) => ({
            ...item,
            name: item.name || 'Unknown Plan',
            color: colors[index % colors.length]
        }));

        res.status(200).json({ data: dataWithColors });
    } catch (error) {
        console.error("Error fetching subscription distribution:", error);
        res.status(500).json({ message: "Error fetching subscription distribution", error: error.message });
    }
};

// Get user activity data
export const getUserActivityData = async (req, res) => {
    try {
        const { period = 'monthly' } = req.query;
        let months = 6;

        if (period === 'weekly') months = 2;
        else if (period === 'yearly') months = 12;

        const data = [];
        const now = new Date();

        for (let i = months - 1; i >= 0; i--) {
            const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

            // Count user signups as sessions proxy
            const sessions = await User.countDocuments({
                createdAt: { $gte: startDate, $lte: endDate }
            });

            // Count subscriptions (users with active plans) proxy
            const interactions = await User.countDocuments({
                createdAt: { $gte: startDate, $lte: endDate },
                status: 'active',
                planId: { $exists: true }
            });


            const monthName = startDate.toLocaleString('default', { month: 'short' });
            data.push({
                name: monthName,
                sessions: sessions * 10, // Multiplier for better visualization
                interactions: interactions * 5
            });
        }

        res.status(200).json({ data });
    } catch (error) {
        console.error("Error fetching user activity data:", error);
        res.status(500).json({ message: "Error fetching user activity data", error: error.message });
    }
};

// Get all dashboard data in one call
export const getAdminDashboardData = async (req, res) => {
    try {
        const { period = 'monthly' } = req.query;
        let months = 6;

        if (period === 'weekly') months = 2;
        else if (period === 'yearly') months = 12;

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        // Stats
        const totalUsers = await User.countDocuments();
        const newUsersThisMonth = await User.countDocuments({ createdAt: { $gte: startOfMonth } });
        const usersLastMonth = await User.countDocuments({
            createdAt: { $gte: startOfLastMonth, $lt: startOfMonth }
        });
        const userGrowthPercent = usersLastMonth > 0
            ? Math.round(((newUsersThisMonth - usersLastMonth) / usersLastMonth) * 100)
            : (newUsersThisMonth > 0 ? 100 : 0);

        const revenueResult = await User.aggregate([
            { $match: { status: 'active', planAmount: { $exists: true } } },
            { $group: { _id: null, total: { $sum: { $convert: { input: { $replaceAll: { input: "$planAmount", find: "$", replacement: "" } }, to: "double", onError: 0, onNull: 0 } } } } }
        ]);
        const totalRevenue = revenueResult[0]?.total || 0;

        const revenueThisMonthResult = await User.aggregate([
            { $match: { createdAt: { $gte: startOfMonth }, status: 'active', planAmount: { $exists: true } } },
            { $group: { _id: null, total: { $sum: { $convert: { input: { $replaceAll: { input: "$planAmount", find: "$", replacement: "" } }, to: "double", onError: 0, onNull: 0 } } } } }
        ]);
        const revenueLastMonthResult = await User.aggregate([
            { $match: { createdAt: { $gte: startOfLastMonth, $lt: startOfMonth }, status: 'active', planAmount: { $exists: true } } },
            { $group: { _id: null, total: { $sum: { $convert: { input: { $replaceAll: { input: "$planAmount", find: "$", replacement: "" } }, to: "double", onError: 0, onNull: 0 } } } } }
        ]);
        const monthlyRevenue = revenueThisMonthResult[0]?.total || 0;
        const lastMonthRevenue = revenueLastMonthResult[0]?.total || 0;
        const revenueGrowthPercent = lastMonthRevenue > 0
            ? Math.round(((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
            : (monthlyRevenue > 0 ? 100 : 0);

        const activeSubscriptions = await User.countDocuments({ status: 'active', planId: { $exists: true } });
        const subscriptionsThisMonth = await User.countDocuments({
            createdAt: { $gte: startOfMonth },
            status: 'active',
            planId: { $exists: true }
        });
        const subscriptionsLastMonth = await User.countDocuments({
            createdAt: { $gte: startOfLastMonth, $lt: startOfMonth },
            status: 'active',
            planId: { $exists: true }
        });
        const subscriptionGrowthPercent = subscriptionsLastMonth > 0
            ? Math.round(((subscriptionsThisMonth - subscriptionsLastMonth) / subscriptionsLastMonth) * 100)
            : (subscriptionsThisMonth > 0 ? 100 : 0);


        // Data/Scraping Stats
        const totalSearches = await Data.countDocuments();
        const searchesThisMonth = await Data.countDocuments({ createdAt: { $gte: startOfMonth } });
        const searchesLastMonth = await Data.countDocuments({
            createdAt: { $gte: startOfLastMonth, $lt: startOfMonth }
        });
        const searchGrowthPercent = searchesLastMonth > 0
            ? Math.round(((searchesThisMonth - searchesLastMonth) / searchesLastMonth) * 100)
            : (searchesThisMonth > 0 ? 100 : 0);

        // Total records scraped
        const totalRecordsResult = await Data.aggregate([
            { $project: { recordCount: { $size: "$leads" } } },
            { $group: { _id: null, total: { $sum: "$recordCount" } } }
        ]);
        const totalRecords = totalRecordsResult[0]?.total || 0;

        // Chart Data
        const userGrowth = [];
        const revenue = [];
        const activity = [];

        for (let i = months - 1; i >= 0; i--) {
            const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
            const monthName = startDate.toLocaleString('default', { month: 'short' });

            // User growth
            const totalUsersUpToDate = await User.countDocuments({ createdAt: { $lte: endDate } });
            const newUsersInMonth = await User.countDocuments({
                createdAt: { $gte: startDate, $lte: endDate }
            });
            userGrowth.push({ name: monthName, users: totalUsersUpToDate, newUsers: newUsersInMonth });

            // Revenue
            const revenueInMonth = await User.aggregate([
                { $match: { createdAt: { $gte: startDate, $lte: endDate }, status: 'active', planAmount: { $exists: true } } },
                { $group: { _id: null, total: { $sum: { $convert: { input: { $replaceAll: { input: "$planAmount", find: "$", replacement: "" } }, to: "double", onError: 0, onNull: 0 } } } } }
            ]);
            const monthRevenue = revenueInMonth[0]?.total || 0;
            revenue.push({
                name: monthName,
                revenue: monthRevenue
            });


            // Activity - use Data model for scraping activity
            const searches = await Data.countDocuments({
                createdAt: { $gte: startDate, $lte: endDate }
            });
            const recordsInMonth = await Data.aggregate([
                { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
                { $project: { recordCount: { $size: "$leads" } } },
                { $group: { _id: null, total: { $sum: "$recordCount" } } }
            ]);
            activity.push({
                name: monthName,
                searches: searches,
                records: recordsInMonth[0]?.total || 0
            });
        }

        // Subscription Distribution
        const distributionResult = await User.aggregate([
            { $match: { status: 'active', planId: { $exists: true } } },
            { $group: { _id: "$planName", value: { $sum: 1 } } },
            {
                $project: {
                    name: "$_id",
                    value: 1,
                    _id: 0
                }
            }
        ]);


        const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
        const subscriptions = distributionResult.map((item, index) => ({
            name: item.name || 'Unknown Plan',
            value: item.value,
            color: colors[index % colors.length]
        }));

        res.status(200).json({
            stats: {
                totalUsers,
                userGrowthPercent,
                totalRevenue,
                revenueGrowthPercent,
                activeSubscriptions,
                subscriptionGrowthPercent,
                totalSearches,
                searchGrowthPercent,
                totalRecords
            },
            chartData: {
                userGrowth,
                revenue,
                activity,
                subscriptions
            }
        });
    } catch (error) {
        console.error("Error fetching admin dashboard data:", error);
        res.status(500).json({ message: "Error fetching dashboard data", error: error.message });
    }
};

// Get individual user details and stats
export const getUserDetailsStats = async (req, res) => {
    try {
        const { userId } = req.params;
        const { period = 'monthly' } = req.query;

        // Get user basic info
        const user = await User.findById(userId).select('-password');
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        let months = 6;
        if (period === 'weekly') months = 2;
        else if (period === 'yearly') months = 12;

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        // User's subscription info (since history is deleted, we use current)
        const activeSubscription = user.status === 'active' && user.planId ? {
            packageName: user.planName,
            amount: user.planAmount,
            status: user.status,
            createdAt: user.createdAt,
            planExpiry: user.planExpiry
        } : null;


        // Total amount spent by user (current plan amount)
        const totalSpent = (user.status === 'active' && user.planAmount) ? 
            parseFloat(user.planAmount.replace('$', '')) || 0 : 0;


        // User's scraping/search stats
        const totalSearches = await Data.countDocuments({ userId: userId });
        const searchesThisMonth = await Data.countDocuments({
            userId: userId,
            createdAt: { $gte: startOfMonth }
        });

        // Total records scraped by user
        const totalRecordsResult = await Data.aggregate([
            { $match: { userId: user._id } },
            { $project: { recordCount: { $size: "$leads" } } },
            { $group: { _id: null, total: { $sum: "$recordCount" } } }
        ]);
        const totalRecords = totalRecordsResult[0]?.total || 0;

        // Subscription history (No longer trackable as separate models are gone, returning current as history)
        const subscriptionHistory = activeSubscription ? [activeSubscription] : [];


        // Monthly spending chart data
        const spendingData = [];
        for (let i = months - 1; i >= 0; i--) {
            const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
            const monthName = startDate.toLocaleString('default', { month: 'short' });

            const monthSpent = (user.status === 'active' && user.createdAt >= startDate && user.createdAt <= endDate) ? totalSpent : 0;

            spendingData.push({
                name: monthName,
                amount: monthSpent
            });
        }


        // Monthly search activity chart data
        const searchActivityData = [];
        for (let i = months - 1; i >= 0; i--) {
            const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
            const monthName = startDate.toLocaleString('default', { month: 'short' });

            const searches = await Data.countDocuments({
                userId: userId,
                createdAt: { $gte: startDate, $lte: endDate }
            });

            const recordsResult = await Data.aggregate([
                { $match: { userId: user._id, createdAt: { $gte: startDate, $lte: endDate } } },
                { $project: { recordCount: { $size: "$leads" } } },
                { $group: { _id: null, total: { $sum: "$recordCount" } } }
            ]);

            searchActivityData.push({
                name: monthName,
                searches: searches,
                records: recordsResult[0]?.total || 0
            });
        }

        // Recent searches
        const recentSearches = await Data.find({ userId: userId })
            .select('searchString createdAt leads')
            .sort({ createdAt: -1 })
            .limit(5);

        const recentSearchesFormatted = recentSearches.map(search => ({
            _id: search._id,
            searchString: search.searchString,
            recordCount: search.leads?.length || 0,
            createdAt: search.createdAt
        }));

        // Subscription status distribution
        const subscriptionDistribution = user.planId ? [{
            name: user.status === 'active' ? 'Active' : 'Pending',
            value: 1,
            color: user.status === 'active' ? '#10B981' : '#F59E0B'
        }] : [];




        res.status(200).json({
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                country: user.country,
                aboutUser: user.aboutUser,
                role: user.role,
                status: user.status,
                paymentScreenshot: user.paymentScreenshot,
                planName: user.planName,
                planAmount: user.planAmount,
                planExpiry: user.planExpiry,
                planId: user.planId,
                createdAt: user.createdAt
            },
            stats: {
                totalSubscriptions: user.planId ? 1 : 0,
                totalSpent,
                totalSearches,
                searchesThisMonth,
                totalRecords,
                hasActiveSubscription: !!activeSubscription
            },
            activeSubscription,
            subscriptionHistory,
            recentSearches: recentSearchesFormatted,
            chartData: {
                spending: spendingData,
                searchActivity: searchActivityData,
                subscriptionDistribution
            }
        });
    } catch (error) {
        console.error("Error fetching user details:", error);
        res.status(500).json({ message: "Error fetching user details", error: error.message });
    }
};
