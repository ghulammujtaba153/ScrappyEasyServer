import User from "../models/userSchema.js";
import Data from "../models/dataSchema.js";
import LeadData from "../models/leadDataSchema.js";
import QualifiedLeads from "../models/qualifiedLeadsSchema.js";
import Team from "../models/teamSchema.js";

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
            { $match: { status: 'active', planAmount: { $exists: true, $ne: "" } } },
            { $group: { _id: null, total: { $sum: { $convert: { input: { $trim: { input: "$planAmount", chars: " $" } }, to: "double", onError: 0, onNull: 0 } } } } }
        ]);
        const totalRevenue = revenueResult[0]?.total || 0;


        // Revenue this month (Users who upgraded/registered this month)
        const revenueThisMonth = await User.aggregate([
            { $match: { createdAt: { $gte: startOfMonth }, status: 'active', planAmount: { $exists: true, $ne: "" } } },
            { $group: { _id: null, total: { $sum: { $convert: { input: { $trim: { input: "$planAmount", chars: " $" } }, to: "double", onError: 0, onNull: 0 } } } } }
        ]);
        const monthlyRevenue = revenueThisMonth[0]?.total || 0;


        // Revenue last month for comparison
        const revenueLastMonth = await User.aggregate([
            { $match: { createdAt: { $gte: startOfLastMonth, $lt: startOfMonth }, status: 'active', planAmount: { $exists: true, $ne: "" } } },
            { $group: { _id: null, total: { $sum: { $convert: { input: { $trim: { input: "$planAmount", chars: " $" } }, to: "double", onError: 0, onNull: 0 } } } } }
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

// Get user growth data for charts
export const getUserGrowthData = async (req, res) => {
    try {
        const months = 6;
        const now = new Date();
        const userGrowth = [];

        for (let i = months - 1; i >= 0; i--) {
            const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
            const monthName = startDate.toLocaleString('default', { month: 'short' });

            const totalUsersUpToDate = await User.countDocuments({ createdAt: { $lte: endDate } });
            const newUsersInMonth = await User.countDocuments({
                createdAt: { $gte: startDate, $lte: endDate }
            });
            userGrowth.push({ name: monthName, users: totalUsersUpToDate, newUsers: newUsersInMonth });
        }

        res.status(200).json({ success: true, data: userGrowth });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get revenue data for charts
export const getRevenueData = async (req, res) => {
    try {
        const months = 6;
        const now = new Date();
        const revenue = [];

        for (let i = months - 1; i >= 0; i--) {
            const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
            const monthName = startDate.toLocaleString('default', { month: 'short' });

            const revenueInMonth = await User.aggregate([
                { $match: { createdAt: { $gte: startDate, $lte: endDate }, status: 'active', planAmount: { $exists: true, $ne: "" } } },
                { $group: { _id: null, total: { $sum: { $convert: { input: { $trim: { input: "$planAmount", chars: " $" } }, to: "double", onError: 0, onNull: 0 } } } } }
            ]);

            revenue.push({
                name: monthName,
                revenue: revenueInMonth[0]?.total || 0
            });
        }

        res.status(200).json({ success: true, data: revenue });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get subscription distribution data
export const getSubscriptionDistribution = async (req, res) => {
    try {
        const distributionResult = await User.aggregate([
            { $match: { status: 'active', planId: { $exists: true } } },
            { $group: { _id: "$planName", value: { $sum: 1 } } },
            { $project: { name: "$_id", value: 1, _id: 0 } }
        ]);

        const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
        const subscriptions = distributionResult.map((item, index) => ({
            name: item.name || 'Unknown Plan',
            value: item.value,
            color: colors[index % colors.length]
        }));

        res.status(200).json({ success: true, data: subscriptions });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get user activity data (scrapes/searches)
export const getUserActivityData = async (req, res) => {
    try {
        const months = 6;
        const now = new Date();
        const activity = [];

        for (let i = months - 1; i >= 0; i--) {
            const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
            const monthName = startDate.toLocaleString('default', { month: 'short' });

            const monthlySearches = await Data.countDocuments({
                createdAt: { $gte: startDate, $lte: endDate }
            });
            const monthlyRecords = await LeadData.countDocuments({
                createdAt: { $gte: startDate, $lte: endDate }
            });

            activity.push({
                name: monthName,
                searches: monthlySearches,
                records: monthlyRecords
            });
        }

        res.status(200).json({ success: true, data: activity });
    } catch (error) {
        res.status(500).json({ error: error.message });
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

        // Combine independent dashboard queries into a single Promise.all for maximum efficiency
        const [
            totalUsers, newUsersThisMonth, usersLastMonth,
            revenueResult, revenueThisMonthResult, revenueLastMonthResult,
            activeSubscriptions, subscriptionsThisMonth, subscriptionsLastMonth,
            totalSearches, searchesThisMonth, searchesLastMonth,
            totalRecords, recordsThisMonth, recordsLastMonth,
            totalEmailsDiscovered, totalSocialsDiscovered, verifiedWhatsApp, interestedLeads,
            distributionResult
        ] = await Promise.all([
            // 1. User Stats
            User.countDocuments(),
            User.countDocuments({ createdAt: { $gte: startOfMonth } }),
            User.countDocuments({ createdAt: { $gte: startOfLastMonth, $lt: startOfMonth } }),
            
            // 2. Revenue Stats
            User.aggregate([
                { $match: { status: 'active', planAmount: { $exists: true, $ne: "" }, $or: [{ planExpiry: { $exists: false } }, { planExpiry: { $gte: now } }] } },
                { $group: { _id: null, total: { $sum: { $convert: { input: { $trim: { input: "$planAmount", chars: " $" } }, to: "double", onError: 0, onNull: 0 } } } } }
            ]),
            User.aggregate([
                { $match: { createdAt: { $gte: startOfMonth }, status: 'active', planAmount: { $exists: true, $ne: "" } } },
                { $group: { _id: null, total: { $sum: { $convert: { input: { $trim: { input: "$planAmount", chars: " $" } }, to: "double", onError: 0, onNull: 0 } } } } }
            ]),
            User.aggregate([
                { $match: { createdAt: { $gte: startOfLastMonth, $lt: startOfMonth }, status: 'active', planAmount: { $exists: true, $ne: "" } } },
                { $group: { _id: null, total: { $sum: { $convert: { input: { $trim: { input: "$planAmount", chars: " $" } }, to: "double", onError: 0, onNull: 0 } } } } }
            ]),

            // 3. Subscription Stats
            User.countDocuments({ status: 'active', planId: { $exists: true, $ne: "" }, $or: [{ planExpiry: { $exists: false } }, { planExpiry: { $gte: now } }] }),
            User.countDocuments({ createdAt: { $gte: startOfMonth }, status: 'active', planId: { $exists: true, $ne: "" } }),
            User.countDocuments({ createdAt: { $gte: startOfLastMonth, $lt: startOfMonth }, status: 'active', planId: { $exists: true, $ne: "" } }),

            // 4. Operation/Search Stats
            Data.countDocuments(),
            Data.countDocuments({ createdAt: { $gte: startOfMonth } }),
            Data.countDocuments({ createdAt: { $gte: startOfLastMonth, $lt: startOfMonth } }),

            // 5. Record/Lead Stats
            LeadData.countDocuments(),
            LeadData.countDocuments({ createdAt: { $gte: startOfMonth } }),
            LeadData.countDocuments({ createdAt: { $gte: startOfLastMonth, $lt: startOfMonth } }),

            // Enrichment Stats
            LeadData.countDocuments({ emails: { $not: { $size: 0 } } }),
            LeadData.countDocuments({
                $or: [
                    { "socialMedia.facebook": { $ne: '' } }, { "socialMedia.instagram": { $ne: '' } },
                    { "socialMedia.linkedin": { $ne: '' } }, { "socialMedia.twitter": { $ne: '' } },
                    { "socialMedia.youtube": { $ne: '' } }, { "socialMedia.tiktok": { $ne: '' } }
                ]
            }),
            LeadData.countDocuments({ whatsappStatus: 'verified' }),
            LeadData.countDocuments({ status: 'interested' }),

            // 7. Subscription Distribution
            User.aggregate([
                { $match: { status: 'active', planId: { $exists: true, $ne: "" }, $or: [{ planExpiry: { $exists: false } }, { planExpiry: { $gte: now } }] } },
                { $group: { _id: "$planName", value: { $sum: 1 } } },
                { $project: { name: "$_id", value: 1, _id: 0 } }
            ])
        ]);

        const userGrowthPercent = usersLastMonth > 0 ? Math.round(((newUsersThisMonth - usersLastMonth) / usersLastMonth) * 100) : (newUsersThisMonth > 0 ? 100 : 0);
        
        const totalRevenue = revenueResult[0]?.total || 0;
        const monthlyRevenue = revenueThisMonthResult[0]?.total || 0;
        const lastMonthRevenue = revenueLastMonthResult[0]?.total || 0;
        const revenueGrowthPercent = lastMonthRevenue > 0 ? Math.round(((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : (monthlyRevenue > 0 ? 100 : 0);
        
        const subscriptionGrowthPercent = subscriptionsLastMonth > 0 ? Math.round(((subscriptionsThisMonth - subscriptionsLastMonth) / subscriptionsLastMonth) * 100) : (subscriptionsThisMonth > 0 ? 100 : 0);
        
        const searchGrowthPercent = searchesLastMonth > 0 ? Math.round(((searchesThisMonth - searchesLastMonth) / searchesLastMonth) * 100) : (searchesThisMonth > 0 ? 100 : 0);
        
        const recordGrowthPercent = recordsLastMonth > 0 ? Math.round(((recordsThisMonth - recordsLastMonth) / recordsLastMonth) * 100) : (recordsThisMonth > 0 ? 100 : 0);

        // 6. Growth Chart Data (Last 6 months) - Fetch all months in parallel
        const growthPromises = [];
        for (let i = months - 1; i >= 0; i--) {
            const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
            const monthName = startDate.toLocaleString('default', { month: 'short' });

            growthPromises.push(Promise.all([
                User.countDocuments({ createdAt: { $lte: endDate } }),
                User.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
                User.aggregate([
                    { $match: { createdAt: { $gte: startDate, $lte: endDate }, status: 'active', planAmount: { $exists: true, $ne: "" } } },
                    { $group: { _id: null, total: { $sum: { $convert: { input: { $trim: { input: "$planAmount", chars: " $" } }, to: "double", onError: 0, onNull: 0 } } } } }
                ]),
                Data.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
                LeadData.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } })
            ]).then(([totalUsersUpToDate, newUsersInMonth, revenueInMonth, monthlySearches, monthlyRecords]) => ({
                monthName, totalUsersUpToDate, newUsersInMonth, 
                revenueInMonthTotal: revenueInMonth[0]?.total || 0, 
                monthlySearches, monthlyRecords
            })));
        }

        const growthResults = await Promise.all(growthPromises);

        const userGrowth = [];
        const revenue = [];
        const activity = [];

        growthResults.forEach(res => {
            userGrowth.push({ name: res.monthName, users: res.totalUsersUpToDate, newUsers: res.newUsersInMonth });
            revenue.push({ name: res.monthName, revenue: res.revenueInMonthTotal });
            activity.push({ name: res.monthName, searches: res.monthlySearches, records: res.monthlyRecords });
        });

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
                totalRecords,
                recordGrowthPercent,
                totalEmailsDiscovered,
                totalSocialsDiscovered,
                verifiedWhatsApp,
                interestedLeads
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

        // Teams created by user
        const teams = await Team.find({ owner: userId }).select('name members createdAt');

        // Contact / Lead statistics
        const [
            whatsappVerified,
            interested,
            notInterested,
            noResponse,
            notReached
        ] = await Promise.all([
            LeadData.countDocuments({ userId, whatsappStatus: 'verified' }),
            LeadData.countDocuments({ userId, status: 'interested' }),
            LeadData.countDocuments({ userId, status: 'not-interested' }),
            LeadData.countDocuments({ userId, status: 'no-response' }),
            LeadData.countDocuments({ userId, status: 'not-reached' })
        ]);

        const leadStats = {
            whatsappVerified,
            interested,
            notInterested,
            noResponse,
            notReached
        };




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
            teams: teams.map(t => ({
                _id: t._id,
                name: t.name,
                memberCount: t.members?.length || 0,
                createdAt: t.createdAt
            })),
            leadStats,
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

// Get list of all users with subscriptions
export const getAllSubscriptions = async (req, res) => {
    try {
        const subscriptions = await User.find({ planId: { $exists: true, $ne: "" } })
            .select('name email planName planAmount planExpiry status createdAt paymentScreenshot')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, subscriptions });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get detailed subscription analytics
export const getSubscriptionAnalytics = async (req, res) => {
    try {
        const now = new Date();
        const months = 6;
        const revenueTrend = [];
        
        // 1. Revenue Trend (Last 6 months)
        for (let i = months - 1; i >= 0; i--) {
            const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
            const monthName = startDate.toLocaleString('default', { month: 'short' });

            const revenueInMonth = await User.aggregate([
                { $match: { createdAt: { $gte: startDate, $lte: endDate }, status: 'active', planAmount: { $exists: true, $ne: "" } } },
                { $group: { _id: null, total: { $sum: { $convert: { input: { $trim: { input: "$planAmount", chars: " $" } }, to: "double", onError: 0, onNull: 0 } } } } }
            ]);

            revenueTrend.push({
                name: monthName,
                revenue: revenueInMonth[0]?.total || 0
            });
        }

        // 2. Status Distribution
        const distributionResult = await User.aggregate([
            { $match: { planId: { $exists: true, $ne: "" } } },
            { $group: { _id: "$status", value: { $sum: 1 } } },
            { $project: { name: "$_id", value: 1, _id: 0 } }
        ]);

        const statusDistribution = distributionResult.map(item => ({
            name: item.name.charAt(0).toUpperCase() + item.name.slice(1).replace('_', ' '),
            value: item.value
        }));

        // 3. Overall Stats
        const totalUsersWithPlan = await User.countDocuments({ planId: { $exists: true, $ne: "" } });
        const activeSubscriptions = await User.countDocuments({ status: 'active', planId: { $exists: true, $ne: "" } });
        const underReviewCount = await User.countDocuments({ status: 'under_review', planId: { $exists: true, $ne: "" } });
        
        const totalRevenueResult = await User.aggregate([
            { $match: { status: 'active', planAmount: { $exists: true, $ne: "" } } },
            { $group: { _id: null, total: { $sum: { $convert: { input: { $trim: { input: "$planAmount", chars: " $" } }, to: "double", onError: 0, onNull: 0 } } } } }
        ]);
        const totalRevenue = totalRevenueResult[0]?.total || 0;

        res.status(200).json({
            success: true,
            revenueTrend,
            statusDistribution,
            stats: {
                totalUsersWithPlan,
                activeSubscriptions,
                underReviewCount,
                totalRevenue
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
