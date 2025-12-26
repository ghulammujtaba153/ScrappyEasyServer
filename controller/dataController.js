import Data from "../models/dataSchema.js"
import mongoose from "mongoose";


export const createData = async (req, res) => {
    try {
        if (!req.body) {
            return res.status(400).json({ message: "Data is required" });
        }

        // Unique data based on title
        const rawData = Array.isArray(req.body.data) ? req.body.data : [];
        const uniqueData = Array.from(new Map(rawData.map(item => [item.title, item])).values());

        const payload = {
            userId: req.body.userId,
            searchString: req.body.searchString,
            data: uniqueData
        };

        const newData = await Data.create(payload);

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
            // Get data by userId with pagination
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;

            const total = await Data.countDocuments({ userId: req.params.id });
            const data = await Data.find({ userId: req.params.id })
                .skip(skip)
                .limit(limit)
                .sort({ updatedAt: -1 });

            // Calculate unique cities with counts
            const cityCounts = {};
            data.forEach(record => {
                if (record.cityData) {
                    const cityDataMap = record.cityData instanceof Map ?
                        record.cityData :
                        new Map(Object.entries(record.cityData));

                    cityDataMap.forEach((city) => {
                        if (city && city !== 'Unknown' && city !== 'No URL' && city !== 'No Coordinates') {
                            cityCounts[city] = (cityCounts[city] || 0) + 1;
                        }
                    });
                }
            });

            // Format as "cityName (count)"
            const uniqueCities = Object.entries(cityCounts)
                .map(([city, count]) => `${city} (${count})`)
                .sort();

            res.status(200).json({
                success: true,
                data,
                uniqueCities,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit)
                }
            });
        } else {
            // Get all data with pagination
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;

            const total = await Data.countDocuments();
            const data = await Data.find()
                .skip(skip)
                .limit(limit)
                .sort({ updatedAt: -1 });

            // Calculate unique cities with counts
            const cityCounts = {};
            data.forEach(record => {
                if (record.cityData) {
                    const cityDataMap = record.cityData instanceof Map ?
                        record.cityData :
                        new Map(Object.entries(record.cityData));

                    cityDataMap.forEach((city) => {
                        if (city && city !== 'Unknown' && city !== 'No URL' && city !== 'No Coordinates') {
                            cityCounts[city] = (cityCounts[city] || 0) + 1;
                        }
                    });
                }
            });

            // Format as "cityName (count)"
            const uniqueCities = Object.entries(cityCounts)
                .map(([city, count]) => `${city} (${count})`)
                .sort();

            res.status(200).json({
                success: true,
                data,
                uniqueCities,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit)
                }
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
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

export const appendDataEntries = async (req, res) => {
    try {
        const { id } = req.params;
        const { entries } = req.body;

        if (!Array.isArray(entries) || entries.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'entries array is required'
            });
        }

        const record = await Data.findById(id);

        if (!record) {
            return res.status(404).json({
                success: false,
                message: 'Search record not found'
            });
        }

        if (!Array.isArray(record.data)) {
            record.data = [];
        }

        // Create a Set of existing titles for unique check
        const existingTitles = new Set(record.data.map(item => item.title));

        // Filter entries to remove duplicates (both within new entries and against existing data)
        const uniqueEntries = [];
        entries.forEach(entry => {
            if (entry.title && !existingTitles.has(entry.title)) {
                existingTitles.add(entry.title);
                uniqueEntries.push(entry);
            }
        });

        if (uniqueEntries.length > 0) {
            record.data.push(...uniqueEntries);
            await record.save();
        }

        res.status(200).json({
            success: true,
            message: 'Data appended successfully',
            data: record
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
}

export const getDataRecordById = async (req, res) => {
    try {
        const { recordId } = req.params;
        const record = await Data.findById(recordId);

        if (!record) {
            return res.status(404).json({
                success: false,
                message: 'Record not found'
            });
        }

        res.status(200).json({
            success: true,
            data: record
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Update screenshot data from frontend
export const updateScreenshotData = async (req, res) => {
    try {
        const { recordId, screenshotData } = req.body;

        if (!recordId || !screenshotData) {
            return res.status(400).json({
                success: false,
                message: "Record ID and screenshot data are required"
            });
        }

        const record = await Data.findById(recordId);

        if (!record) {
            return res.status(404).json({
                success: false,
                message: "Record not found"
            });
        }

        // Update screenshotData Map
        const updatedScreenshotData = record.screenshotData || new Map();
        Object.entries(screenshotData).forEach(([index, url]) => {
            updatedScreenshotData.set(index, url);
        });

        record.screenshotData = updatedScreenshotData;
        await record.save();

        res.json({
            success: true,
            message: "Screenshot data updated successfully"
        });
    } catch (error) {
        console.error("Error updating screenshot data:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

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


export const getAllUniqueStrings = async (req, res) => {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';

    try {
        const skip = (page - 1) * limit;

        // Cast userId to ObjectId for aggregation match
        const userObjectId = new mongoose.Types.ObjectId(userId);

        const pipeline = [
            { $match: { userId: userObjectId, ...(search && { searchString: { $regex: search, $options: 'i' } }) } },
            // Group by searchString to ensure uniqueness
            {
                $group: {
                    _id: "$searchString",
                    docId: { $first: "$_id" },
                    searchString: { $first: "$searchString" },
                    updatedAt: { $max: "$updatedAt" },
                    dataConfig: { $push: "$data" } // Collect all 'data' arrays
                }
            },
            // Reduce the data arrays to calculate total count
            {
                $project: {
                    _id: 1,
                    id: "$docId",
                    searchString: 1,
                    updatedAt: 1,
                    count: {
                        $reduce: {
                            input: "$dataConfig",
                            initialValue: 0,
                            in: { $add: ["$$value", { $size: { $ifNull: ["$$this", []] } }] }
                        }
                    }
                }
            },
            { $sort: { updatedAt: -1 } },
            {
                $facet: {
                    metadata: [{ $count: "total" }, { $addFields: { page: page } }],
                    data: [{ $skip: skip }, { $limit: limit }]
                }
            }
        ];

        const result = await Data.aggregate(pipeline);
        const metadata = result[0].metadata[0] || { total: 0, page: 1 };
        const data = result[0].data;

        res.status(200).json({
            success: true,
            data: data,
            pagination: {
                total: metadata.total,
                page: page,
                limit: limit,
                pages: Math.ceil(metadata.total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
}

// Update city data from frontend
export const updateCityData = async (req, res) => {
    try {
        const { recordId, cityData } = req.body;

        if (!recordId || !cityData) {
            return res.status(400).json({
                success: false,
                message: "Record ID and city data are required"
            });
        }

        const record = await Data.findById(recordId);

        if (!record) {
            return res.status(404).json({
                success: false,
                message: "Record not found"
            });
        }

        // Update cityData Map
        const updatedCityData = record.cityData || new Map();
        Object.entries(cityData).forEach(([index, city]) => {
            updatedCityData.set(index, city);
        });

        record.cityData = updatedCityData;
        await record.save();

        res.json({
            success: true,
            message: "City data updated successfully"
        });
    } catch (error) {
        console.error("Error updating city data:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};