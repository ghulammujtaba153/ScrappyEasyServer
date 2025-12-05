import Data from "../models/dataSchema.js"

export const createData = async (req, res) => {
    try {
        if (!req.body) {
            return res.status(400).json({ message: "Data is required" });
        }

        const newData = await Data.create(req.body);

        res.status(201).json({
            message: "Data saved successfully",
            data: newData
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

export const getData = async (req, res) => {
    try {
        if (req.params.id) {
            // Get data by userId
            const data = await Data.find({ userId: req.params.id });
            res.status(200).json(data);
        } else {
            // Get all data
            const data = await Data.find();
            res.status(200).json(data);
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const updateData = async (req, res) => {
    try {
        const data = await Data.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.status(200).json({
            message: "Data updated successfully",
            data
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// Get all phone numbers with business details for WhatsApp integration
export const getPhoneNumbers = async (req, res) => {
    try {
        const { userId } = req.params;
        const { categories, countries, states, cities } = req.query;

        // Get all data for the user
        const userData = await Data.find({ userId });

        // Flatten all business data
        const allPhones = [];

        userData.forEach(record => {
            if (record.data && Array.isArray(record.data)) {
                record.data.forEach(item => {
                    if (item.phone) {
                        // Apply filters if provided
                        let includeItem = true;

                        // Category filter (match with searchString)
                        if (categories) {
                            const categoryArray = categories.split(',');
                            includeItem = categoryArray.some(cat =>
                                record.searchString?.toLowerCase().includes(cat.toLowerCase())
                            );
                        }

                        // Country filter
                        if (includeItem && countries) {
                            const countryArray = countries.split(',');
                            includeItem = countryArray.some(country => {
                                const lowerCountry = country.toLowerCase();
                                return record.searchString?.toLowerCase().includes(lowerCountry) ||
                                    item.address?.toLowerCase().includes(lowerCountry);
                            });
                        }

                        // State filter
                        if (includeItem && states) {
                            const stateArray = states.split(',');
                            includeItem = stateArray.some(state => {
                                const lowerState = state.toLowerCase();
                                return record.searchString?.toLowerCase().includes(lowerState) ||
                                    item.address?.toLowerCase().includes(lowerState);
                            });
                        }

                        // City filter
                        if (includeItem && cities) {
                            const cityArray = cities.split(',');
                            includeItem = cityArray.some(city => {
                                const lowerCity = city.toLowerCase();
                                return record.searchString?.toLowerCase().includes(lowerCity) ||
                                    item.address?.toLowerCase().includes(lowerCity);
                            });
                        }

                        if (includeItem) {
                            allPhones.push({
                                phone: item.phone,
                                businessName: item.title || 'Unknown',
                                address: item.address || '',
                                rating: item.rating || '',
                                reviews: item.reviews || '',
                                website: item.website || '',
                                googleMapsLink: item.googleMapsLink || '',
                                searchQuery: record.searchString || '',
                                scrapedDate: record.createdAt
                            });
                        }
                    }
                });
            }
        });

        // Remove duplicates based on phone number
        const uniquePhones = Array.from(
            new Map(allPhones.map(item => [item.phone, item])).values()
        );

        res.status(200).json({
            success: true,
            count: uniquePhones.length,
            data: uniquePhones
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
}