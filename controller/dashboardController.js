import Data from "../models/dataSchema.js";

export const getDashboardStats = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        // Get all data for the user
        const userData = await Data.find({ userId });

        // Initialize counters
        let totalLeads = 0;
        let whatsappAvailable = 0;
        let lowRated = 0;
        const uniqueCities = new Set();

        // Process all records
        userData.forEach(record => {
            if (record.data && Array.isArray(record.data)) {
                record.data.forEach((item, index) => {
                    // Count total leads
                    totalLeads++;

                    
                    // Count WhatsApp available
                    if (record.whatsappVerifications && item.phone) {
                        const verifications = record.whatsappVerifications instanceof Map ?
                            record.whatsappVerifications :
                            new Map(Object.entries(record.whatsappVerifications || {}));
                        
                        // Normalize phone number - add + if not present
                        let normalizedPhone = item.phone.replace(/\D/g, ''); // Remove all non-digits
                        if (normalizedPhone && !normalizedPhone.startsWith('+')) {
                            normalizedPhone = '+' + normalizedPhone;
                        }
                        
                        const verification = verifications.get(normalizedPhone);
                        if (verification && verification.isRegistered) {
                            whatsappAvailable++;
                        }
                    }

                    // Count low rated businesses (< 4.0)
                    const rating = parseFloat(item.rating);
                    if (!isNaN(rating) && rating < 4.0) {
                        lowRated++;
                    }
                });
            }

            // Collect unique cities
            if (record.cityData) {
                const cityDataMap = record.cityData instanceof Map ?
                    record.cityData :
                    new Map(Object.entries(record.cityData || {}));

                cityDataMap.forEach((city) => {
                    if (city && city !== 'Unknown' && city !== 'No URL' && city !== 'No Coordinates') {
                        uniqueCities.add(city);
                    }
                });
            }
        });

        res.status(200).json({
            success: true,
            data: {
                citiesCovered: uniqueCities.size,
                totalLeads: totalLeads,
                whatsappAvailable: whatsappAvailable,
                lowRated: lowRated
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
        let groupBy;

        switch (filter) {
            case 'weekly':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                dateFormat = 'day';
                groupBy = 7;
                break;
            case 'monthly':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                dateFormat = 'week';
                groupBy = 4;
                break;
            case 'yearly':
                startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                dateFormat = 'month';
                groupBy = 12;
                break;
            default:
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                dateFormat = 'day';
                groupBy = 7;
        }

        // Get all data for the user within date range
        const userData = await Data.find({
            userId,
            createdAt: { $gte: startDate }
        }).sort({ createdAt: 1 });

        // Initialize data structures
        const leadsOverTime = [];
        const ratingDistribution = { excellent: 0, good: 0, average: 0, poor: 0 };
        const citiesData = {};
        const whatsappStats = { available: 0, notAvailable: 0 };

        // Process records for time-based data
        const timeGroups = {};
        
        userData.forEach(record => {
            const recordDate = new Date(record.createdAt);
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

            if (record.data && Array.isArray(record.data)) {
                record.data.forEach((item, index) => {
                    timeGroups[timeKey].leads++;

                    // Rating distribution
                    const rating = parseFloat(item.rating);
                    if (!isNaN(rating)) {
                        if (rating >= 4.5) ratingDistribution.excellent++;
                        else if (rating >= 4.0) ratingDistribution.good++;
                        else if (rating >= 3.0) ratingDistribution.average++;
                        else ratingDistribution.poor++;
                    }

                    // WhatsApp stats
                    if (record.whatsappVerifications && item.phone) {
                        const verifications = record.whatsappVerifications instanceof Map ?
                            record.whatsappVerifications :
                            new Map(Object.entries(record.whatsappVerifications || {}));
                        
                        let normalizedPhone = item.phone.replace(/\D/g, '');
                        if (normalizedPhone && !normalizedPhone.startsWith('+')) {
                            normalizedPhone = '+' + normalizedPhone;
                        }
                        
                        const verification = verifications.get(normalizedPhone);
                        if (verification && verification.isRegistered) {
                            whatsappStats.available++;
                            timeGroups[timeKey].whatsapp++;
                        } else {
                            whatsappStats.notAvailable++;
                        }
                    }
                });
            }

            // City data
            if (record.cityData) {
                const cityDataMap = record.cityData instanceof Map ?
                    record.cityData :
                    new Map(Object.entries(record.cityData || {}));

                cityDataMap.forEach((city) => {
                    if (city && city !== 'Unknown' && city !== 'No URL' && city !== 'No Coordinates') {
                        citiesData[city] = (citiesData[city] || 0) + 1;
                    }
                });
            }
        });

        // Format leads over time data
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        let sortedKeys;
        if (dateFormat === 'day') {
            // Sort by day order starting from today and going back
            const today = now.getDay();
            sortedKeys = [];
            for (let i = 6; i >= 0; i--) {
                const dayIndex = (today - i + 7) % 7;
                sortedKeys.push(dayNames[dayIndex]);
            }
        } else if (dateFormat === 'week') {
            sortedKeys = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
        } else {
            // Sort by month order
            const currentMonth = now.getMonth();
            sortedKeys = [];
            for (let i = 11; i >= 0; i--) {
                const monthIndex = (currentMonth - i + 12) % 12;
                sortedKeys.push(monthNames[monthIndex]);
            }
        }

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

        res.status(200).json({
            success: true,
            data: {
                leadsOverTime,
                ratingDistribution: ratingData,
                cityDistribution: cityChartData,
                whatsappDistribution: whatsappData
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
