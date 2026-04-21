import axios from "axios";
import Joi from "joi";
import LeadData from "../models/leadDataSchema.js";

const MAX_PAGES = 3;

// Regular expressions for social media URLs
const socialRegexes = {
    facebook: /(?:https?:\/\/)?(?:www\.)?(?:facebook\.com|fb\.com)\/[a-zA-Z0-9._-]+/i,
    instagram: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/[a-zA-Z0-9._-]+/i,
    linkedin: /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:company|in)\/[a-zA-Z0-9_-]+/i,
    twitter: /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/[a-zA-Z0-9_]+/i,
    youtube: /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:c\/|channel\/|user\/|@)[a-zA-Z0-9_-]+/i,
    tiktok: /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[a-zA-Z0-9_.-]+/i
};

// Filter out common false positives (share links, etc)
const isValidSocialLink = (url, platform) => {
    const lower = url.toLowerCase();
    
    if (lower.includes('share') || lower.includes('sharer') || lower.includes('intent/tweet')) return false;
    if (lower.includes('wp-admin') || lower.includes('wp-content')) return false;
    
    if (platform === 'facebook' && (lower.endsWith('facebook.com') || lower.endsWith('facebook.com/'))) return false;
    if (platform === 'instagram' && (lower.endsWith('instagram.com') || lower.endsWith('instagram.com/'))) return false;
    if (platform === 'twitter' && (lower.endsWith('twitter.com') || lower.endsWith('twitter.com/'))) return false;
    if (platform === 'linkedin' && (lower.endsWith('linkedin.com') || lower.endsWith('linkedin.com/'))) return false;

    return true;
};

const parseSocialsFromHtml = (html) => {
    let socials = {
        facebook: '',
        instagram: '',
        linkedin: '',
        twitter: '',
        youtube: '',
        tiktok: ''
    };

    if (!html) return socials;

    // Use a regex to extract hrefs to avoid parsing the whole document text where random text might match
    const hrefRegex = /href=["']([^"']+)["']/gi;
    let match;

    while ((match = hrefRegex.exec(html)) !== null) {
        const url = match[1];
        
        for (const [platform, regex] of Object.entries(socialRegexes)) {
            if (!socials[platform] && regex.test(url) && isValidSocialLink(url, platform)) {
                const extracted = url.match(regex)[0];
                // Ensure it has https:// proto
                socials[platform] = extracted.startsWith('http') ? extracted : 'https://' + extracted.replace(/^\/\//, '');
            }
        }
    }

    return socials;
};

const extractLinks = (html, baseUrl) => {
    const regex = /href=["']([^"']+)["']/gi;
    let links = [];
    let match;

    while ((match = regex.exec(html)) !== null) {
        try {
            const url = new URL(match[1], baseUrl).href;
            if (
                url.includes("contact") ||
                url.includes("about") ||
                url.includes("social")
            ) {
                links.push(url);
            }
        } catch {}
    }
    return [...new Set(links)];
};

const schema = Joi.object({
    url: Joi.string().uri().required()
});

export const extractSocialsValidation = (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            error: error.details[0].message
        });
    }
    next();
};

const performExtraction = async (url) => {
    const visited = new Set();
    const queue = [url];
    
    let combinedSocials = {
        facebook: '',
        instagram: '',
        linkedin: '',
        twitter: '',
        youtube: '',
        tiktok: ''
    };

    // Helper to check if we have found all socials
    const allFound = (socs) => Object.values(socs).filter(Boolean).length === Object.keys(socs).length;

    while (queue.length && visited.size < MAX_PAGES && !allFound(combinedSocials)) {
        const page = queue.shift();
        if (visited.has(page)) continue;
        visited.add(page);

        try {
            const { data } = await axios.get(page, {
                timeout: 8000,
                headers: { "User-Agent": "Mozilla/5.0" }
            });

            const pageSocials = parseSocialsFromHtml(data);
            
            // Merge found
            for (const key in pageSocials) {
                if (pageSocials[key] && !combinedSocials[key]) {
                    combinedSocials[key] = pageSocials[key];
                }
            }

            const links = extractLinks(data, url);
            links.forEach(l => {
                if (!visited.has(l)) queue.push(l);
            });
        } catch (e) {
            console.log("skip page", page);
        }
    }
    return combinedSocials;
};

export const extractSocials = async (req, res) => {
    try {
        const { url, leadId } = req.body;
        const result = await performExtraction(url);
        
        const count = Object.values(result).filter(Boolean).length;

        if (leadId && count > 0) {
            await LeadData.findByIdAndUpdate(leadId, { socialMedia: result });
        }
        
        return res.json({
            success: true,
            data: {
                socials: result,
                count
            }
        });
    } catch (err) {
        return res.json({
            success: true,
            data: {
                socials: { facebook: '', instagram: '', linkedin: '', twitter: '', youtube: '', tiktok: '' },
                count: 0
            }
        });
    }
};

export const bulkExtractSocials = async (req, res) => {
    try {
        const { recordId, leads } = req.body;

        if (!Array.isArray(leads) || leads.length === 0) {
            return res.status(400).json({ success: false, message: "No leads provided for extraction" });
        }

        console.log(`[BULK SOCIALS] Starting extraction for ${leads.length} websites...`);
        const socialMap = {};
        let successCount = 0;
        let totalSocialsFound = 0;

        for (const item of leads) {
            try {
                if (!item.url) continue;
                const socials = await performExtraction(item.url);
                socialMap[item.leadId] = socials;
                
                const foundCount = Object.values(socials).filter(Boolean).length;
                if (foundCount > 0) {
                    successCount++;
                    totalSocialsFound += foundCount;
                    
                    await LeadData.findByIdAndUpdate(item.leadId, { socialMedia: socials });
                }
            } catch (err) {
                console.error(`[BULK SOCIALS] Failed to extract from ${item.url}:`, err.message);
            }
        }

        console.log(`[BULK SOCIALS] Done. Found ${totalSocialsFound} social links across ${successCount} successful extractions.`);

        res.status(200).json({
            success: true,
            message: "Bulk social extraction completed",
            extractedCount: successCount,
            totalSocials: totalSocialsFound,
            data: socialMap
        });

    } catch (error) {
        console.error("Bulk extraction error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};
