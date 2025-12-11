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
