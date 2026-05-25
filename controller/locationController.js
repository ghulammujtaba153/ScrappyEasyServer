import xlsx from "xlsx";
import path from "path";
import { fileURLToPath } from "url";
import Data from "../models/dataSchema.js";

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

/**
 * Find nearby cities based on coordinates only
 * This endpoint is optimized for finding recommendations near scraped data points
 * 
 * Query Parameters:
 * - lat: Latitude (required)
 * - lng: Longitude (required)
 * - limit: Number of cities to return (default: 20)
 * - radius: Maximum distance in km (default: 150)
 * - minPopulation: Minimum population filter (optional)
 */
export const find_nearby_cities = async (req, res) => {
    try {
        const { lat, lng, limit = 20, radius = 150, minPopulation = 0 } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({
                success: false,
                message: "Please provide lat and lng coordinates",
            });
        }

        const targetLat = parseFloat(lat);
        const targetLng = parseFloat(lng);

        if (isNaN(targetLat) || isNaN(targetLng)) {
            return res.status(400).json({
                success: false,
                message: "Invalid latitude or longitude values",
            });
        }

        // Find all cities within radius
        const nearbyCities = citiesData
            .filter(c => {
                // Filter by minimum population if specified
                if (minPopulation && (c.population || 0) < parseInt(minPopulation)) return false;
                return true;
            })
            .map(c => {
                const distance = haversineDistance(
                    targetLat,
                    targetLng,
                    parseFloat(c.lat),
                    parseFloat(c.lng)
                );
                return {
                    city: c.city,
                    city_ascii: c.city_ascii,
                    lat: parseFloat(c.lat),
                    lng: parseFloat(c.lng),
                    country: c.country,
                    iso2: c.iso2,
                    iso3: c.iso3,
                    admin_name: c.admin_name,
                    capital: c.capital,
                    population: c.population || 0,
                    id: c.id,
                    distance_km: Math.round(distance * 100) / 100,
                };
            })
            .filter(c => c.distance_km <= parseFloat(radius) && c.distance_km > 0.5) // Exclude very close (likely same location)
            .sort((a, b) => a.distance_km - b.distance_km)
            .slice(0, parseInt(limit));

        res.status(200).json({
            success: true,
            message: "Nearby cities retrieved successfully",
            searchPoint: { lat: targetLat, lng: targetLng },
            count: nearbyCities.length,
            cities: nearbyCities,
        });
    } catch (error) {
        console.error("Error in find_nearby_cities:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message,
        });
    }
};

/**
 * Smart recommendation engine that handles city, state, country, and compound queries.
 * Handles full display_name strings like "Tampa, Florida, United States".
 * Sorts neighboring areas by population (not distance) to surface high-value missed areas.
 *
 * Query Parameters:
 * - q: The search query (e.g., "Tampa", "Florida", "Tampa, Florida, United States")
 * - userId: The user ID to check against existing scraped data
 * - limit: Max number of results (default 10)
 */
export const get_smart_recommendations = async (req, res) => {
    try {
        const { q, userId, limit = 10 } = req.query;

        if (!q) {
            return res.status(400).json({ success: false, message: "Query parameter 'q' is required" });
        }

        const mkDisplayName = (c) => [c.city, c.admin_name, c.country].filter(Boolean).join(", ");

        const withScrapeCounts = async (cities) => {
            if (!userId) return cities.map(c => ({ ...c, scrapeCount: 0 }));
            const userData = await Data.find({ userId }).select('searchString');
            const scrapedQueries = userData.map(d => d.searchString.toLowerCase());
            return cities.map(c => ({
                ...c,
                scrapeCount: scrapedQueries.filter(sq => sq.includes(c.city.toLowerCase())).length
            }));
        };

        const smartSort = (cities) => cities.sort((a, b) => {
            if (a.scrapeCount !== b.scrapeCount) return a.scrapeCount - b.scrapeCount;
            return (b.population || 0) - (a.population || 0);
        });

        const buildNeighbors = (cities) => cities.map(c => ({
            city: c.city,
            lat: c.lat,
            lng: c.lng,
            admin_name: c.admin_name,
            country: c.country,
            population: c.population,
            distance_km: c.distance_km,
            scraped_before: (c.scrapeCount || 0) > 0,
            display_name: mkDisplayName(c)
        }));

        const parts = q.split(",").map(p => p.trim().toLowerCase()).filter(Boolean);
        const p0 = parts[0] || "";   
        const p1 = parts[1] || null; 
        const p2 = parts[2] || null; 

        // ── Find potential matches for City, State, and Country ──────────
        
        // 1. City Match
        let cityMatch = citiesData.find(c => {
            const nameMatch = c.city?.toLowerCase() === p0 || c.city_ascii?.toLowerCase() === p0;
            if (!nameMatch) return false;
            if (p1 && c.admin_name && !c.admin_name.toLowerCase().includes(p1)) return false;
            if (p2 && c.country && !c.country.toLowerCase().includes(p2)) return false;
            return true;
        });
        if (!cityMatch) {
            cityMatch = citiesData.find(c => c.city?.toLowerCase() === p0 || c.city_ascii?.toLowerCase() === p0);
        }

        // 2. State Match
        let stateCities = citiesData.filter(c => c.admin_name && c.admin_name.toLowerCase() === p0);
        if (stateCities.length === 0 && p1) {
            stateCities = citiesData.filter(c => c.admin_name && c.admin_name.toLowerCase() === p1);
        }

        // 3. Country Match
        const countryQuery = p2 || p1 || p0;
        let countryCities = citiesData.filter(c => c.country && c.country.toLowerCase() === countryQuery);
        if (countryCities.length === 0 && countryQuery !== p0) {
            countryCities = citiesData.filter(c => c.country && c.country.toLowerCase() === p0);
        }

        // ── Disambiguate using Population Scores ──────────────────────────
        let cityScore = cityMatch ? (cityMatch.population || 0) : -1;
        let stateScore = stateCities.length > 0 ? Math.max(...stateCities.map(c => c.population || 0)) : -1;
        let countryScore = countryCities.length > 0 ? Math.max(...countryCities.map(c => c.population || 0)) : -1;

        // Determine the winner
        const maxScore = Math.max(cityScore, stateScore, countryScore);

        if (maxScore === -1) {
            return res.status(404).json({
                success: false,
                message: `No city, state, or country matching "${q}" was found.`
            });
        }

        // ── Handle Winner ─────────────────────────────────────────────────
        // Tie breaker preference: City > State > Country
        if (cityScore === maxScore) {
            const lat = parseFloat(cityMatch.lat);
            const lng = parseFloat(cityMatch.lng);

            let neighbors = citiesData
                .filter(c => c.id !== cityMatch.id)
                .map(c => {
                    const dist = haversineDistance(lat, lng, parseFloat(c.lat), parseFloat(c.lng));
                    return { ...c, distance_km: Math.round(dist * 100) / 100 };
                })
                .filter(c => c.distance_km <= 150);

            neighbors = await withScrapeCounts(neighbors);

            // Priority:
            // 1. Unexplored (scrapeCount)
            // 2. Closest distance (neighboring)
            neighbors.sort((a, b) => {
                // 1. Unexplored wins
                if (a.scrapeCount !== b.scrapeCount) return a.scrapeCount - b.scrapeCount;
                
                // 2. Closest distance wins
                return a.distance_km - b.distance_km;
            });

            return res.status(200).json({
                success: true,
                type: "city",
                city: cityMatch.city,
                count: Math.min(neighbors.length, parseInt(limit)),
                neighbors: buildNeighbors(neighbors.slice(0, parseInt(limit)))
            });
        } 
        else if (stateScore === maxScore) {
            stateCities = await withScrapeCounts(stateCities);
            smartSort(stateCities);

            return res.status(200).json({
                success: true,
                type: "state",
                state: q,
                count: Math.min(stateCities.length, parseInt(limit)),
                neighbors: buildNeighbors(stateCities.slice(0, parseInt(limit)))
            });
        } 
        else {
            countryCities = await withScrapeCounts(countryCities);
            smartSort(countryCities);

            return res.status(200).json({
                success: true,
                type: "country",
                country: q,
                count: Math.min(countryCities.length, parseInt(limit)),
                neighbors: buildNeighbors(countryCities.slice(0, parseInt(limit)))
            });
        }

    } catch (error) {
        console.error("Error in get_smart_recommendations:", error);
        res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
};
