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

const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}/gi;

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

const isValidEmail = (email) => {
    const invalidDomains = ["example.com", "domain.com", "test.com", "sentry.io", "w3.org", "wordpress.org", "cloudflare.com", "schema.org"];
    const lower = email.toLowerCase();
    const domain = lower.split("@")[1];
    if (!domain) return false;
    if (invalidDomains.some(d => domain.includes(d))) return false;
    if (lower.length > 60) return false;
    return true;
};

const decodeHtmlEntities = (str) => {
    return str.replace(/&#64;/g, "@").replace(/&#46;/g, ".").replace(/%40/g, "@");
};

const decodeCloudflareEmail = (encoded) => {
    const r = parseInt(encoded.substr(0, 2), 16);
    let email = "";
    for (let n = 2; encoded.length - n; n += 2) {
        const code = parseInt(encoded.substr(n, 2), 16) ^ r;
        email += String.fromCharCode(code);
    }
    return email;
};

const parseSocialsFromHtml = (html) => {
    let socials = {
        facebook: '', instagram: '', linkedin: '', twitter: '', youtube: '', tiktok: ''
    };
    if (!html) return socials;
    const hrefRegex = /href=["']([^"']+)["']/gi;
    let match;
    while ((match = hrefRegex.exec(html)) !== null) {
        const url = match[1];
        for (const [platform, regex] of Object.entries(socialRegexes)) {
            if (!socials[platform] && regex.test(url) && isValidSocialLink(url, platform)) {
                const extracted = url.match(regex)[0];
                socials[platform] = extracted.startsWith('http') ? extracted : 'https://' + extracted.replace(/^\/\//, '');
            }
        }
    }
    return socials;
};

const parseEmailsFromHtml = (html) => {
    let emails = [];
    if (!html) return emails;
    html = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
    html = decodeHtmlEntities(html);
    const matches = html.match(emailRegex) || [];
    emails.push(...matches);
    const mailtoRegex = /mailto:([^\?\"'>]+)/gi;
    let match;
    while ((match = mailtoRegex.exec(html)) !== null) { emails.push(match[1]); }
    const cfRegex = /data-cfemail="([a-f0-9]+)"/gi;
    while ((match = cfRegex.exec(html)) !== null) {
        const decoded = decodeCloudflareEmail(match[1]);
        emails.push(decoded);
    }
    return [...new Set(emails.filter(isValidEmail))];
};

const extractLinks = (html, baseUrl) => {
    const regex = /href=["']([^"']+)["']/gi;
    let links = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
        try {
            const url = new URL(match[1], baseUrl).href;
            if (url.includes("contact") || url.includes("about") || url.includes("social") || url.includes("team")) {
                links.push(url);
            }
        } catch {}
    }
    return [...new Set(links)];
};

const schema = Joi.object({
    url: Joi.string().uri().required(),
    leadId: Joi.string().optional()
});

export const extractSocialsValidation = (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
        return res.status(400).json({ success: false, error: error.details[0].message });
    }
    next();
};

const performExtraction = async (url) => {
    const visited = new Set();
    const queue = [url];
    const emails = new Set();
    let combinedSocials = {
        facebook: '', instagram: '', linkedin: '', twitter: '', youtube: '', tiktok: ''
    };

    const allFound = (socs) => Object.values(socs).filter(Boolean).length === Object.keys(socs).length;

    while (queue.length && visited.size < MAX_PAGES) {
        const page = queue.shift();
        if (visited.has(page)) continue;
        visited.add(page);

        try {
            const { data } = await axios.get(page, {
                timeout: 8000,
                headers: { "User-Agent": "Mozilla/5.0" }
            });

            // Extract Socials
            const pageSocials = parseSocialsFromHtml(data);
            for (const key in pageSocials) {
                if (pageSocials[key] && !combinedSocials[key]) {
                    combinedSocials[key] = pageSocials[key];
                }
            }

            // Extract Emails
            const foundEmails = parseEmailsFromHtml(data);
            foundEmails.forEach(e => emails.add(e));

            // If we have found everything, we can stop early
            if (allFound(combinedSocials) && emails.size > 0 && visited.size >= 2) break;

            const links = extractLinks(data, url);
            links.forEach(l => {
                if (!visited.has(l)) queue.push(l);
            });
        } catch (e) {
            console.log("skip page", page);
        }
    }
    return { socials: combinedSocials, emails: [...emails] };
};

export const extractSocials = async (req, res) => {
    try {
        const { url, leadId } = req.body;
        const result = await performExtraction(url);
        
        const count = Object.values(result.socials).filter(Boolean).length + result.emails.length;

        if (leadId && count > 0) {
            await LeadData.findByIdAndUpdate(leadId, { 
                socialMedia: result.socials,
                emails: result.emails 
            });
        }
        
        return res.json({
            success: true,
            data: {
                socials: result.socials,
                emails: result.emails,
                count
            }
        });
    } catch (err) {
        return res.json({
            success: true,
            data: {
                socials: { facebook: '', instagram: '', linkedin: '', twitter: '', youtube: '', tiktok: '' },
                emails: [],
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
        const resultMap = {};
        let successCount = 0;
        let totalItemsFound = 0;

        for (const item of leads) {
            try {
                if (!item.url) continue;
                const result = await performExtraction(item.url);
                resultMap[item.leadId] = result;
                
                const foundCount = Object.values(result.socials).filter(Boolean).length + result.emails.length;
                if (foundCount > 0) {
                    successCount++;
                    totalItemsFound += foundCount;
                    
                    await LeadData.findByIdAndUpdate(item.leadId, { 
                        socialMedia: result.socials,
                        emails: result.emails 
                    });
                }
            } catch (err) {
                console.error(`[BULK SOCIALS] Failed to extract from ${item.url}:`, err.message);
            }
        }

        res.status(200).json({
            success: true,
            message: "Bulk social & email extraction completed",
            extractedCount: successCount,
            totalFound: totalItemsFound,
            data: resultMap
        });

    } catch (error) {
        console.error("Bulk extraction error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};
