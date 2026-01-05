import LeadData from "../models/leadDataSchema.js";
import ColdCall from "../models/coldCallSchema.js";
import AutomateMessage from "../models/automateMessageSchema.js";
import QualifiedLeads from "../models/qualifiedLeadsSchema.js";
import mongoose from "mongoose";

export const getDashboardStats = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        // Get aggregated stats directly from LeadData collection
        const stats = await LeadData.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(userId) } },
            {
                $group: {
                    _id: null,
                    totalLeads: { $sum: 1 },
                    whatsappAvailable: {
                        $sum: {
                            $cond: [{ $eq: ['$whatsappStatus', 'verified'] }, 1, 0]
                        }
                    },
                    lowRated: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $ne: ['$rating', ''] },
                                        { $lt: [{ $toDouble: '$rating' }, 4.0] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },
                    cities: { $addToSet: '$city' }
                }
            }
        ]);

        // Filter out empty/invalid cities and count unique ones
        const result = stats[0] || { totalLeads: 0, whatsappAvailable: 0, lowRated: 0, cities: [] };
        const validCities = result.cities.filter(city => 
            city && city !== '' && city !== 'Unknown' && city !== 'No URL' && city !== 'No Coordinates'
        );

        res.status(200).json({
            success: true,
            data: {
                citiesCovered: validCities.length,
                totalLeads: result.totalLeads,
                whatsappAvailable: result.whatsappAvailable,
                lowRated: result.lowRated
            }
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// Get chart data for dashboard
export const getDashboardChartData = async (req, res) => {
    try {
        const { userId } = req.params;
        const { filter = 'weekly' } = req.query;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        // Calculate date range based on filter
        const now = new Date();
        let startDate;
        let dateFormat;

        switch (filter) {
            case 'weekly':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                dateFormat = 'day';
                break;
            case 'monthly':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                dateFormat = 'week';
                break;
            case 'yearly':
                startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                dateFormat = 'month';
                break;
            default:
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                dateFormat = 'day';
        }

        // Get all leads for the user within date range
        const leads = await LeadData.find({
            userId: new mongoose.Types.ObjectId(userId),
            createdAt: { $gte: startDate }
        }).sort({ createdAt: 1 });

        // Initialize data structures
        const timeGroups = {};
        const ratingDistribution = { excellent: 0, good: 0, average: 0, poor: 0 };
        const citiesData = {};
        const whatsappStats = { available: 0, notAvailable: 0 };

        // Process each lead
        leads.forEach(lead => {
            const recordDate = new Date(lead.createdAt);
            let timeKey;

            if (dateFormat === 'day') {
                timeKey = recordDate.toLocaleDateString('en-US', { weekday: 'short' });
            } else if (dateFormat === 'week') {
                const weekNum = Math.ceil((now - recordDate) / (7 * 24 * 60 * 60 * 1000));
                timeKey = `Week ${5 - weekNum}`;
            } else {
                timeKey = recordDate.toLocaleDateString('en-US', { month: 'short' });
            }

            if (!timeGroups[timeKey]) {
                timeGroups[timeKey] = { leads: 0, whatsapp: 0 };
            }

            timeGroups[timeKey].leads++;

            // Rating distribution
            const rating = parseFloat(lead.rating);
            if (!isNaN(rating)) {
                if (rating >= 4.5) ratingDistribution.excellent++;
                else if (rating >= 4.0) ratingDistribution.good++;
                else if (rating >= 3.0) ratingDistribution.average++;
                else ratingDistribution.poor++;
            }

            // WhatsApp stats
            if (lead.whatsappStatus === 'verified') {
                whatsappStats.available++;
                timeGroups[timeKey].whatsapp++;
            } else if (lead.whatsappStatus === 'not-verified') {
                whatsappStats.notAvailable++;
            }

            // City data
            if (lead.city && lead.city !== '' && lead.city !== 'Unknown' && lead.city !== 'No URL' && lead.city !== 'No Coordinates') {
                citiesData[lead.city] = (citiesData[lead.city] || 0) + 1;
            }
        });

        // Format leads over time data
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        let sortedKeys;
        if (dateFormat === 'day') {
            const today = now.getDay();
            sortedKeys = [];
            for (let i = 6; i >= 0; i--) {
                const dayIndex = (today - i + 7) % 7;
                sortedKeys.push(dayNames[dayIndex]);
            }
        } else if (dateFormat === 'week') {
            sortedKeys = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
        } else {
            const currentMonth = now.getMonth();
            sortedKeys = [];
            for (let i = 11; i >= 0; i--) {
                const monthIndex = (currentMonth - i + 12) % 12;
                sortedKeys.push(monthNames[monthIndex]);
            }
        }

        const leadsOverTime = [];
        sortedKeys.forEach(key => {
            leadsOverTime.push({
                name: key,
                leads: timeGroups[key]?.leads || 0,
                whatsapp: timeGroups[key]?.whatsapp || 0
            });
        });

        // Format rating distribution for pie chart
        const ratingData = [
            { name: 'Excellent (4.5+)', value: ratingDistribution.excellent },
            { name: 'Good (4.0-4.5)', value: ratingDistribution.good },
            { name: 'Average (3.0-4.0)', value: ratingDistribution.average },
            { name: 'Poor (<3.0)', value: ratingDistribution.poor }
        ].filter(item => item.value > 0);

        // Format city data - top 6 cities
        const cityChartData = Object.entries(citiesData)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([name, value]) => ({ name, value }));

        // WhatsApp distribution
        const whatsappData = [
            { name: 'Available', value: whatsappStats.available },
            { name: 'Not Available', value: whatsappStats.notAvailable }
        ].filter(item => item.value > 0);

        // Communication Methods Stats - Cold Calls & Messages
        const userObjectId = new mongoose.Types.ObjectId(userId);
        
        // Get cold call stats
        const coldCallCampaigns = await ColdCall.find({ userId: userObjectId })
            .populate({
                path: 'qualifiedLeadsId',
                select: 'entries',
                populate: {
                    path: 'entries.leadId',
                    select: 'phone'
                }
            });
        
        let coldCallTotal = 0;
        let coldCallContacted = 0;
        
        coldCallCampaigns.forEach(campaign => {
            if (campaign.qualifiedLeadsId?.entries?.length > 0) {
                // Qualified leads campaign
                const entries = campaign.qualifiedLeadsId.entries.filter(e => e.leadId?.phone);
                coldCallTotal += entries.length;
                coldCallContacted += entries.filter(e => 
                    e.callStatus && e.callStatus !== 'not-called' && e.callStatus !== 'pending'
                ).length;
            } else if (campaign.numbers?.length > 0) {
                // Legacy numbers
                coldCallTotal += campaign.numbers.length;
                coldCallContacted += campaign.numbers.filter(n => 
                    n.status && n.status !== 'not-called' && n.status !== 'pending'
                ).length;
            }
        });

        // Get message stats
        const messageCampaigns = await AutomateMessage.find({ userId: userObjectId })
            .populate({
                path: 'qualifiedLeadsId',
                select: 'entries',
                populate: {
                    path: 'entries.leadId',
                    select: 'phone'
                }
            });
        
        let messageTotal = 0;
        let messageContacted = 0;
        
        messageCampaigns.forEach(campaign => {
            if (campaign.qualifiedLeadsId?.entries?.length > 0) {
                // Qualified leads campaign
                const entries = campaign.qualifiedLeadsId.entries.filter(e => e.leadId?.phone);
                messageTotal += entries.length;
                messageContacted += entries.filter(e => 
                    e.messageStatus && e.messageStatus !== 'not-sent' && e.messageStatus !== 'pending'
                ).length;
            } else if (campaign.numbers?.length > 0) {
                // Legacy numbers
                messageTotal += campaign.numbers.length;
                messageContacted += campaign.numbers.filter(n => 
                    n.status === 'sent' || n.status === 'delivered' || n.status === 'read'
                ).length;
            }
        });

        const communicationMethods = [
            { method: 'coldCall', contacted: coldCallContacted, total: coldCallTotal },
            { method: 'messages', contacted: messageContacted, total: messageTotal }
        ];

        res.status(200).json({
            success: true,
            data: {
                leadsOverTime,
                ratingDistribution: ratingData,
                cityDistribution: cityChartData,
                whatsappDistribution: whatsappData,
                communicationMethods
            }
        });
    } catch (error) {
        console.error('Dashboard chart data error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
