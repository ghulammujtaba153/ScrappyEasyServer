import csv from "csvtojson";
import Data from "../models/dataSchema.js"
import LeadData from "../models/leadDataSchema.js"
import mongoose from "mongoose";
// Bulk import leads from CSV
export const importCSVData = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "CSV file is required" });
        }

        // Parse CSV file
        const leads = await csv().fromString(req.file.buffer.toString());

        // Validate required fields (title is required for uniqueness)
        const validLeads = leads.filter(item => item.title && item.title.trim() !== "");
        if (validLeads.length === 0) {
            return res.status(400).json({ message: "No valid leads found in CSV" });
        }

        // Get userId and searchString from body or query
        const userId = req.body.userId || req.query.userId;
        const searchString = req.body.searchString || req.query.searchString || "CSV Import";
        const operationId = req.body.operationId || req.query.operationId;
        
        if (!userId) {
            return res.status(400).json({ message: "userId is required" });
        }

        let operation;
        let existingTitles = new Set();

        if (operationId) {
            operation = await Data.findById(operationId).populate('leads');
            if (operation) {
                existingTitles = new Set(operation.leads.map(lead => lead.title));
            } else {
                return res.status(404).json({ message: "Specified operation not found" });
            }
        } else {
            // Create new operation record
            operation = await Data.create({
                userId,
                searchString,
                leads: []
            });
        }

        // Filter and remove duplicates by title (from both CSV and existing operation)
        const uniqueLeads = Array.from(new Map(
            validLeads
            .filter(item => !existingTitles.has(item.title))
            .map(item => [item.title, item])
        ).values());

        if (uniqueLeads.length === 0) {
            return res.status(200).json({
                message: "No new unique leads found to import",
                data: operation,
                imported: 0
            });
        }

        // Create LeadData documents
        const leadDocs = await Promise.all(uniqueLeads.map(item =>
            LeadData.create({
                userId,
                operationId: operation._id,
                title: item.title || '',
                rating: item.rating || '',
                reviews: item.reviews || '',
                phone: item.phone || '',
                address: item.address || '',
                city: item.city || '',
                website: item.website || '',
                googleMapsLink: item.googleMapsLink || '',
                metadata: item
            })
        ));

        // Add new lead references to operation
        const newLeadIds = leadDocs.map(doc => doc._id);
        if (operationId) {
            operation.leads.push(...newLeadIds);
        } else {
            operation.leads = newLeadIds;
        }
        
        await operation.save();

        res.status(201).json({
            message: operationId ? "Leads appended successfully" : "CSV data imported successfully",
            data: operation,
            imported: leadDocs.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


// Update individual lead data
export const updateLead = async (req, res) => {
    try {
        const { leadId } = req.params;
        const updatedLead = await LeadData.findByIdAndUpdate(
            leadId,
            req.body,
            { new: true }
        );

        if (!updatedLead) {
            return res.status(404).json({
                success: false,
                message: "Lead not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Lead updated successfully",
            data: updatedLead
        });
    } catch (error) {
        console.error("Error updating lead:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Delete individual lead
export const deleteLead = async (req, res) => {
    try {
        const { leadId } = req.params;
        const lead = await LeadData.findById(leadId);

        if (!lead) {
            return res.status(404).json({
                success: false,
                message: "Lead not found"
            });
        }

        // Remove from Data operation record if it exists
        if (lead.operationId) {
            await Data.findByIdAndUpdate(lead.operationId, {
                $pull: { leads: lead._id }
            });
        }

        // Delete the lead document
        await LeadData.findByIdAndDelete(leadId);

        res.status(200).json({
            success: true,
            message: "Lead deleted successfully"
        });
    } catch (error) {
        console.error("Error deleting lead:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


export const createData = async (req, res) => {
    try {
        if (!req.body) {
            return res.status(400).json({ message: "Data is required" });
        }
        console.log("Received data:", req.body);

        const { userId, searchString, data: rawData } = req.body;

        // Unique data based on title
        const dataArray = Array.isArray(rawData) ? rawData : [];
        const uniqueData = Array.from(new Map(dataArray.map(item => [item.title, item])).values());

        // Create the operation record first
        const newOperation = await Data.create({
            userId,
            searchString,
            leads: []
        });

        // Create LeadData documents for each unique entry
        const leadDocs = await Promise.all(uniqueData.map(item => 
            LeadData.create({
                userId,
                operationId: newOperation._id,
                title: item.title || '',
                rating: item.rating || '',
                reviews: item.reviews || '',
                phone: item.phone || '',
                address: item.address || '',
                city: item.city || '',
                website: item.website || '',
                googleMapsLink: item.googleMapsLink || '',
                metadata: item
            })
        ));

        // Update operation with lead references
        newOperation.leads = leadDocs.map(doc => doc._id);
        await newOperation.save();

        res.status(201).json({
            message: "Data saved successfully",
            data: newOperation
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

            // Cast userId to ObjectId for proper matching
            let userIdQuery;
            try {
                const targetId = req.effectiveUserId || req.params.id;
                userIdQuery = new mongoose.Types.ObjectId(targetId);
            } catch (e) {
                userIdQuery = req.effectiveUserId || req.params.id;
            }

            const total = await Data.countDocuments({ userId: userIdQuery });
            const data = await Data.find({ userId: userIdQuery })
                .populate('leads')
                .skip(skip)
                .limit(limit)
                .sort({ updatedAt: -1 });

            // Calculate unique cities with counts from LeadData
            const cityCounts = {};
            data.forEach(record => {
                if (record.leads && record.leads.length > 0) {
                    record.leads.forEach(lead => {
                        const city = lead.city;
                        if (city && city !== 'Unknown' && city !== 'No URL' && city !== 'No Coordinates' && city !== '') {
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
                .populate('leads')
                .skip(skip)
                .limit(limit)
                .sort({ updatedAt: -1 });

            // Calculate unique cities with counts from LeadData
            const cityCounts = {};
            data.forEach(record => {
                if (record.leads && record.leads.length > 0) {
                    record.leads.forEach(lead => {
                        const city = lead.city;
                        if (city && city !== 'Unknown' && city !== 'No URL' && city !== 'No Coordinates' && city !== '') {
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

export const deleteData = async (req, res) => {
    try {
        const data = await Data.findById(req.params.id);
        
        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Record not found"
            });
        }

        // Delete all associated LeadData documents
        if (data.leads && data.leads.length > 0) {
            await LeadData.deleteMany({ _id: { $in: data.leads } });
        }

        // Delete the operation record
        await Data.findByIdAndDelete(req.params.id);
        
        res.status(200).json({
            success: true,
            message: "Data deleted successfully"
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

        const record = await Data.findById(id).populate('leads');

        if (!record) {
            return res.status(404).json({
                success: false,
                message: 'Search record not found'
            });
        }

        // Get existing titles from LeadData
        const existingTitles = new Set(record.leads.map(lead => lead.title));

        // Filter entries to remove duplicates
        const uniqueEntries = entries.filter(entry => 
            entry.title && !existingTitles.has(entry.title)
        );

        if (uniqueEntries.length > 0) {
            // Create new LeadData documents
            const newLeads = await Promise.all(uniqueEntries.map(item =>
                LeadData.create({
                    userId: record.userId,
                    operationId: record._id,
                    title: item.title || '',
                    rating: item.rating || '',
                    reviews: item.reviews || '',
                    phone: item.phone || '',
                    address: item.address || '',
                    city: item.city || '',
                    website: item.website || '',
                    googleMapsLink: item.googleMapsLink || '',
                    metadata: item
                })
            ));

            // Add new lead references to operation
            record.leads.push(...newLeads.map(lead => lead._id));
            
            await record.save();
        }

        // Fetch updated record with populated leads
        const updatedRecord = await Data.findById(id).populate('leads');

        res.status(200).json({
            success: true,
            message: 'Data appended successfully',
            data: updatedRecord
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
        const record = await Data.findById(recordId).populate('leads');

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

// Update screenshot URL for a lead
export const updateScreenshotData = async (req, res) => {
    try {
        const { recordId, screenshotData } = req.body;

        if (!screenshotData || Object.keys(screenshotData).length === 0) {
            return res.status(400).json({
                success: false,
                message: "Screenshot data is required"
            });
        }

        // screenshotData can be { leadId: url } or { index: url } format
        const updatePromises = Object.entries(screenshotData).map(async ([key, url]) => {
            // Check if key is a valid ObjectId (leadId)
            if (mongoose.Types.ObjectId.isValid(key)) {
                return LeadData.findByIdAndUpdate(
                    key,
                    { screenshotUrl: url },
                    { new: true }
                );
            } else if (recordId) {
                // Fallback for legacy index-based updates
                const record = await Data.findById(recordId).populate('leads');
                const leadIndex = parseInt(key);
                if (record?.leads?.[leadIndex]) {
                    return LeadData.findByIdAndUpdate(
                        record.leads[leadIndex]._id,
                        { screenshotUrl: url },
                        { new: true }
                    );
                }
            }
        });

        await Promise.all(updatePromises);

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
        const userId = req.effectiveUserId || req.params.userId;
        const { categories, countries, states, cities } = req.query;

        // Get all LeadData for the user
        const leads = await LeadData.find({ userId }).populate('operationId', 'searchString createdAt');

        // Filter and map leads
        const allPhones = leads
            .filter(lead => {
                if (!lead.phone) return false;

                let includeItem = true;
                const searchString = lead.operationId?.searchString || '';
                const address = lead.address || '';

                // Category filter
                if (categories) {
                    const categoryArray = categories.split(',');
                    includeItem = categoryArray.some(cat =>
                        searchString.toLowerCase().includes(cat.toLowerCase())
                    );
                }

                // Country filter
                if (includeItem && countries) {
                    const countryArray = countries.split(',');
                    includeItem = countryArray.some(country => {
                        const lowerCountry = country.toLowerCase();
                        return searchString.toLowerCase().includes(lowerCountry) ||
                            address.toLowerCase().includes(lowerCountry);
                    });
                }

                // State filter
                if (includeItem && states) {
                    const stateArray = states.split(',');
                    includeItem = stateArray.some(state => {
                        const lowerState = state.toLowerCase();
                        return searchString.toLowerCase().includes(lowerState) ||
                            address.toLowerCase().includes(lowerState);
                    });
                }

                // City filter
                if (includeItem && cities) {
                    const cityArray = cities.split(',');
                    includeItem = cityArray.some(city => {
                        const lowerCity = city.toLowerCase();
                        return searchString.toLowerCase().includes(lowerCity) ||
                            address.toLowerCase().includes(lowerCity) ||
                            (lead.city && lead.city.toLowerCase().includes(lowerCity));
                    });
                }

                return includeItem;
            })
            .map(lead => ({
                phone: lead.phone,
                businessName: lead.title || 'Unknown',
                address: lead.address || '',
                city: lead.city || '',
                rating: lead.rating || '',
                reviews: lead.reviews || '',
                website: lead.website || '',
                googleMapsLink: lead.googleMapsLink || '',
                searchQuery: lead.operationId?.searchString || '',
                scrapedDate: lead.createdAt,
                leadId: lead._id
            }));

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
    const userId = req.effectiveUserId || req.params.userId;
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
                    leadsConfig: { $push: "$leads" } // Collect all 'leads' arrays
                }
            },
            // Calculate count from leads
            {
                $project: {
                    _id: 1,
                    id: "$docId",
                    searchString: 1,
                    updatedAt: 1,
                    count: {
                        $reduce: {
                            input: "$leadsConfig",
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

// Update city data for a lead
export const updateCityData = async (req, res) => {
    try {
        const { recordId, cityData } = req.body;

        if (!cityData || Object.keys(cityData).length === 0) {
            return res.status(400).json({
                success: false,
                message: "City data is required"
            });
        }

        // cityData is now { leadId: city } format
        const updatePromises = Object.entries(cityData).map(async ([leadId, city]) => {
            // Check if leadId is a valid ObjectId (not an index)
            if (mongoose.Types.ObjectId.isValid(leadId)) {
                return LeadData.findByIdAndUpdate(
                    leadId,
                    { city },
                    { new: true }
                );
            } else if (recordId) {
                // Fallback for legacy index-based updates
                const record = await Data.findById(recordId).populate('leads');
                const leadIndex = parseInt(leadId);
                if (record?.leads?.[leadIndex]) {
                    return LeadData.findByIdAndUpdate(
                        record.leads[leadIndex]._id,
                        { city },
                        { new: true }
                    );
                }
            }
        });

        await Promise.all(updatePromises);

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

// Toggle favorite status for a lead
export const toggleFavorite = async (req, res) => {
    try {
        const { recordId, leadId, itemIndex, favorite } = req.body;

        // Support both leadId and itemIndex
        let targetLeadId = leadId;

        if (!targetLeadId && recordId !== undefined && itemIndex !== undefined) {
            const record = await Data.findById(recordId).populate('leads');

            if (!record) {
                return res.status(404).json({
                    success: false,
                    message: "Record not found"
                });
            }

            if (!record.leads || !record.leads[itemIndex]) {
                return res.status(404).json({
                    success: false,
                    message: "Lead not found at specified index"
                });
            }

            targetLeadId = record.leads[itemIndex]._id;
        }

        if (!targetLeadId) {
            return res.status(400).json({
                success: false,
                message: "Lead ID or Record ID with item index is required"
            });
        }

        // Update favorite status on LeadData
        const lead = await LeadData.findById(targetLeadId);
        
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: "Lead not found"
            });
        }

        lead.favorite = favorite !== undefined ? favorite : !lead.favorite;
        await lead.save();

        res.json({
            success: true,
            message: lead.favorite ? "Added to favorites" : "Removed from favorites",
            favorite: lead.favorite
        });
    } catch (error) {
        console.error("Error toggling favorite:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Update WhatsApp status for a lead
export const updateWhatsAppStatus = async (req, res) => {
    try {
        const { leadId, whatsappStatus } = req.body;

        if (!leadId || !whatsappStatus) {
            return res.status(400).json({
                success: false,
                message: "Lead ID and WhatsApp status are required"
            });
        }

        const lead = await LeadData.findByIdAndUpdate(
            leadId,
            { 
                whatsappStatus,
                whatsappVerifiedAt: new Date()
            },
            { new: true }
        );

        if (!lead) {
            return res.status(404).json({
                success: false,
                message: "Lead not found"
            });
        }

        res.json({
            success: true,
            message: "WhatsApp status updated successfully",
            lead
        });
    } catch (error) {
        console.error("Error updating WhatsApp status:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Bulk update WhatsApp status for multiple leads
export const bulkUpdateWhatsAppStatus = async (req, res) => {
    try {
        const { updates } = req.body; // Array of { phone, status }

        if (!updates || !Array.isArray(updates)) {
            return res.status(400).json({
                success: false,
                message: "Updates array is required"
            });
        }

        const bulkOps = updates.map(({ phone, status }) => ({
            updateMany: {
                filter: { phone },
                update: { 
                    whatsappStatus: status,
                    whatsappVerifiedAt: new Date()
                }
            }
        }));

        await LeadData.bulkWrite(bulkOps);

        res.json({
            success: true,
            message: `Updated ${updates.length} leads`
        });
    } catch (error) {
        console.error("Error bulk updating WhatsApp status:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Update lead status (not-reached, interested, not-interested, no-response)
export const updateLeadStatus = async (req, res) => {
    try {
        const { leadId, status } = req.body;
        
        if (!leadId || !status) {
            return res.status(400).json({
                success: false,
                message: 'leadId and status are required'
            });
        }

        const validStatuses = ['not-reached', 'interested', 'not-interested', 'no-response'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
            });
        }

        const updatedLead = await LeadData.findByIdAndUpdate(
            leadId,
            { status },
            { new: true }
        );

        if (!updatedLead) {
            return res.status(404).json({
                success: false,
                message: 'Lead not found'
            });
        }

        res.json({
            success: true,
            data: updatedLead
        });
    } catch (error) {
        console.error("Error updating lead status:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};