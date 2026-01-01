import User from "../models/userSchema.js";
import Subscription from "../models/subscriptionSchema.js";
import Package from "../models/packageSchema.js";
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

        // Total Revenue
        const revenueResult = await Subscription.aggregate([
            { $match: { status: 'Active' } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const totalRevenue = revenueResult[0]?.total || 0;

        // Revenue this month
        const revenueThisMonth = await Subscription.aggregate([
            { $match: { createdAt: { $gte: startOfMonth }, status: 'Active' } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const monthlyRevenue = revenueThisMonth[0]?.total || 0;

        // Revenue last month for comparison
        const revenueLastMonth = await Subscription.aggregate([
            { $match: { createdAt: { $gte: startOfLastMonth, $lt: startOfMonth }, status: 'Active' } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const lastMonthRevenue = revenueLastMonth[0]?.total || 0;
        const revenueGrowthPercent = lastMonthRevenue > 0 
            ? Math.round(((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) 
            : 100;

        // Active Subscriptions
        const activeSubscriptions = await Subscription.countDocuments({ status: 'Active' });
        
        // Subscriptions last month
        const subscriptionsLastMonth = await Subscription.countDocuments({ 
            createdAt: { $gte: startOfLastMonth, $lt: startOfMonth },
            status: 'Active'
        });
        const subscriptionsThisMonth = await Subscription.countDocuments({ 
            createdAt: { $gte: startOfMonth },
            status: 'Active'
        });
        const subscriptionGrowthPercent = subscriptionsLastMonth > 0 
            ? Math.round(((subscriptionsThisMonth - subscriptionsLastMonth) / subscriptionsLastMonth) * 100) 
            : 100;

        // Active Users (users with active subscriptions)
        const activeUsers = await Subscription.distinct('user', { status: 'Active' });
        const activeUserCount = activeUsers.length;

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
            
            const revenueResult = await Subscription.aggregate([
                { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
                { $group: { _id: null, total: { $sum: "$amount" } } }
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
        const distribution = await Subscription.aggregate([
            { $match: { status: 'Active' } },
            { $group: { _id: "$package", value: { $sum: 1 } } },
            {
                $lookup: {
                    from: 'packages',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'packageInfo'
                }
            },
            {
                $project: {
                    name: { $arrayElemAt: ['$packageInfo.name', 0] },
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
            
            // Count subscriptions as interactions proxy
            const interactions = await Subscription.countDocuments({ 
                createdAt: { $gte: startDate, $lte: endDate } 
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

        const revenueResult = await Subscription.aggregate([
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const totalRevenue = revenueResult[0]?.total || 0;

        const revenueThisMonthResult = await Subscription.aggregate([
            { $match: { createdAt: { $gte: startOfMonth } } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const revenueLastMonthResult = await Subscription.aggregate([
            { $match: { createdAt: { $gte: startOfLastMonth, $lt: startOfMonth } } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const monthlyRevenue = revenueThisMonthResult[0]?.total || 0;
        const lastMonthRevenue = revenueLastMonthResult[0]?.total || 0;
        const revenueGrowthPercent = lastMonthRevenue > 0 
            ? Math.round(((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) 
            : (monthlyRevenue > 0 ? 100 : 0);

        const activeSubscriptions = await Subscription.countDocuments({ status: 'Active' });
        const subscriptionsThisMonth = await Subscription.countDocuments({ 
            createdAt: { $gte: startOfMonth }
        });
        const subscriptionsLastMonth = await Subscription.countDocuments({ 
            createdAt: { $gte: startOfLastMonth, $lt: startOfMonth }
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
            { $project: { recordCount: { $size: "$data" } } },
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
            const revenueInMonth = await Subscription.aggregate([
                { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
                { $group: { _id: null, total: { $sum: "$amount" } } }
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
                { $project: { recordCount: { $size: "$data" } } },
                { $group: { _id: null, total: { $sum: "$recordCount" } } }
            ]);
            activity.push({ 
                name: monthName, 
                searches: searches,
                records: recordsInMonth[0]?.total || 0
            });
        }

        // Subscription Distribution
        const distributionResult = await Subscription.aggregate([
            { $match: { status: 'Active' } },
            { $group: { _id: "$package", value: { $sum: 1 } } },
            {
                $lookup: {
                    from: 'packages',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'packageInfo'
                }
            },
            {
                $project: {
                    name: { $arrayElemAt: ['$packageInfo.name', 0] },
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
