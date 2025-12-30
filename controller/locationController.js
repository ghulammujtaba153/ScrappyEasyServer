import xlsx from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the Excel file once when the module is loaded
const workbook = xlsx.readFile(path.join(__dirname, "../utils/worldcities.xlsx"));
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const citiesData = xlsx.utils.sheet_to_json(worksheet);

/**
 * Calculate the Haversine distance between two points on Earth
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
const haversineDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

/**
 * Recommend neighboring cities based on a given city or coordinates
 * 
 * Query Parameters:
 * - city: Name of the city to find neighbors for
 * - lat: Latitude (required if city is not provided)
 * - lng: Longitude (required if city is not provided)
 * - country: Filter by country (optional)
 * - iso2: Filter by ISO2 country code (optional)
 * - iso3: Filter by ISO3 country code (optional)
 * - limit: Number of neighbors to return (default: 10)
 * - radius: Maximum distance in km (optional)
 */
export const recommend_neighbors = async (req, res) => {
    try {
        const { name, country, iso2, iso3, limit = 1000 } = req.query;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Please provide a name to match admin_name",
            });
        }

        const adminQuery = name.toLowerCase();

        // Filter cities by admin_name match
        let results = citiesData.filter((c) => {
            if (!c.admin_name) return false;

            // Match admin_name (partial + case-insensitive)
            if (!c.admin_name.toLowerCase().includes(adminQuery)) {
                return false;
            }

            // Optional filters
            if (country && c.country?.toLowerCase() !== country.toLowerCase())
                return false;

            if (iso2 && c.iso2?.toLowerCase() !== iso2.toLowerCase())
                return false;

            if (iso3 && c.iso3?.toLowerCase() !== iso3.toLowerCase())
                return false;

            return true;
        });

        // Sort by population (largest cities first)
        results = results
            .sort((a, b) => (b.population || 0) - (a.population || 0))
            .slice(0, Number(limit))
            .map((c) => ({
                city: c.city,
                city_ascii: c.city_ascii,
                lat: c.lat,
                lng: c.lng,
                country: c.country,
                iso2: c.iso2,
                iso3: c.iso3,
                admin_name: c.admin_name,
                capital: c.capital,
                population: c.population,
                id: c.id,
            }));

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: `No cities found for admin_name matching "${name}"`,
            });
        }

        res.status(200).json({
            success: true,
            admin_name: results[0].admin_name,
            country: results[0].country,
            count: results.length,
            cities: results,
        });
    } catch (error) {
        console.error("Error in recommend_neighbors:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message,
        });
    }
};

/**
 * Find neighboring cities based on a city name or coordinates
 * 
 * Query Parameters:
 * - city: Name of the city to find neighbors for
 * - lat: Latitude (required if city is not provided)
 * - lng: Longitude (required if city is not provided)
 * - country: Filter neighbors by country (optional)
 * - limit: Number of neighbors to return (default: 20)
 * - radius: Maximum distance in km (optional)
 */
export const find_city_neighbors = async (req, res) => {
    try {
        const { city, lat, lng, country, limit = 20, radius } = req.query;

        let targetLat, targetLng;
        let targetCity = null;

        // If city name is provided, find it in the dataset
        if (city) {
            targetCity = citiesData.find(
                (c) =>
                    c.city?.toLowerCase() === city.toLowerCase() ||
                    c.city_ascii?.toLowerCase() === city.toLowerCase()
            );

            if (!targetCity) {
                return res.status(404).json({
                    success: false,
                    message: `City "${city}" not found in the database`,
                });
            }

            targetLat = parseFloat(targetCity.lat);
            targetLng = parseFloat(targetCity.lng);
        } else if (lat && lng) {
            // Use provided coordinates
            targetLat = parseFloat(lat);
            targetLng = parseFloat(lng);

            if (isNaN(targetLat) || isNaN(targetLng)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid latitude or longitude values",
                });
            }
        } else {
            return res.status(400).json({
                success: false,
                message: "Please provide either a city name or lat/lng coordinates",
            });
        }

        // Filter and calculate distances for all cities
        let neighbors = citiesData
            .filter((c) => {
                // Exclude the target city itself
                if (targetCity && c.id === targetCity.id) return false;

                // Apply country filter if provided
                if (country && c.country?.toLowerCase() !== country.toLowerCase()) return false;

                return true;
            })
            .map((c) => {
                const distance = haversineDistance(
                    targetLat,
                    targetLng,
                    parseFloat(c.lat),
                    parseFloat(c.lng)
                );
                return {
                    city: c.city,
                    city_ascii: c.city_ascii,
                    lat: c.lat,
                    lng: c.lng,
                    country: c.country,
                    iso2: c.iso2,
                    iso3: c.iso3,
                    admin_name: c.admin_name,
                    capital: c.capital,
                    population: c.population,
                    id: c.id,
                    distance_km: Math.round(distance * 100) / 100,
                };
            })
            .filter((c) => {
                // Apply radius filter if provided
                if (radius && c.distance_km > parseFloat(radius)) return false;
                return true;
            })
            .sort((a, b) => a.distance_km - b.distance_km)
            .slice(0, parseInt(limit));

        res.status(200).json({
            success: true,
            message: "Neighboring cities retrieved successfully",
            target: targetCity
                ? {
                      city: targetCity.city,
                      city_ascii: targetCity.city_ascii,
                      lat: targetCity.lat,
                      lng: targetCity.lng,
                      country: targetCity.country,
                      iso2: targetCity.iso2,
                      iso3: targetCity.iso3,
                      admin_name: targetCity.admin_name,
                      capital: targetCity.capital,
                      population: targetCity.population,
                      id: targetCity.id,
                  }
                : { lat: targetLat, lng: targetLng },
            count: neighbors.length,
            neighbors,
        });
    } catch (error) {
        console.error("Error in find_city_neighbors:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message,
        });
    }
};



