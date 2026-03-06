import axios from "axios";
import Joi from "joi";

// Helper to filter valid emails (no image extensions like .png, no generic placeholders usually)
const isValidEmailAddress = (email) => {
    const falsePositives = ["example.com", "yourdomain.com", "yoursite.com", "sentry.io", "wixpress.com"];
    const invalidExtensions = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".js", ".css", ".pdf", ".mp4"];
    
    const lowerEmail = email.toLowerCase();
    
    if (falsePositives.some((f) => lowerEmail.includes(f))) return false;
    if (invalidExtensions.some((ext) => lowerEmail.endsWith(ext))) return false;
    
    // Some basic length checks
    if (email.length > 50 || email.length < 5) return false;

    // Filter out useless generic noreply leads
    if (lowerEmail.startsWith("no-reply") || lowerEmail.startsWith("noreply")) return false;
    
    return true;
};

const extractEmailsFromHtml = (html) => {
    if (!html || typeof html !== 'string') return [];
    // Universal basic email regex
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
    const foundEmails = html.match(emailRegex) || [];
    return [...new Set(foundEmails)].filter(isValidEmailAddress);
};

// Helper to normalize relative links back to absolute ones (e.g., "/contact" => "https://example.com/contact")
const normalizeLink = (base, relative) => {
    try {
        return new URL(relative, base).href;
    } catch {
        return null; // Invalid URL
    }
};

// Joi Validation Schema
const extractSchema = Joi.object({
    url: Joi.string().uri().required()
});

export const extractEmailsValidation = (req, res, next) => {
    const { error } = extractSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ success: false, error: error.details[0].message });
    }
    next();
};

export const extractEmails = async (req, res) => {
    try {
        const { url } = req.body;
        
        let allValidEmails = [];

        // 1. Fetch main page HTML
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const axiosConfig = {
            timeout: 10000,
            signal: controller.signal,
            maxContentLength: 5000000, // Limit to 5MB to avoid accidental huge PDF/video downloads
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            }
        };

        const { data: mainHtml } = await axios.get(url, axiosConfig);
        clearTimeout(timeoutId);
        
        const mainEmails = extractEmailsFromHtml(mainHtml);
        allValidEmails.push(...mainEmails);

        // 2. Shallow Crawling Strategy: If we didn't find many emails on the homepage,
        // we'll look for a classic "Contact Us" or "About" link and scrape that page too!
        if (allValidEmails.length < 3) {
            // Regex to grab any href link that contains text like 'contact', 'about', or 'team'
            const linkRegex = /href=["']([^"']*(?:contact|about|team)[^"']*)["']/gi;
            let match;
            let contactLink = null;

            while ((match = linkRegex.exec(mainHtml)) !== null) {
                const link = normalizeLink(url, match[1]);
                if (link && link.startsWith("http") && !link.includes("mailto:")) {
                    contactLink = link;
                    break; // Just grab the first promising link we find
                }
            }

            // 3. Fetch the contact/about page and combine emails!
            if (contactLink) {
                console.log(`Checking sub-page for more emails: ${contactLink}`);
                try {
                    const contactController = new AbortController();
                    const contactTimeoutId = setTimeout(() => contactController.abort(), 8000); 
                    
                    const { data: contactHtml } = await axios.get(contactLink, {
                        ...axiosConfig,
                        signal: contactController.signal
                    });
                    
                    clearTimeout(contactTimeoutId);
                    const contactEmails = extractEmailsFromHtml(contactHtml);
                    allValidEmails.push(...contactEmails);
                } catch (subPageError) {
                    console.error(`Failed to fetch sub-page ${contactLink}:`, subPageError.message);
                }
            }
        }
        
        // Final Deduplication from combined pools
        const uniqueValidEmails = [...new Set(allValidEmails)];
            
        return res.status(200).json({ 
            success: true, 
            data: { 
                emails: uniqueValidEmails,
                count: uniqueValidEmails.length,
                scrapedUrl: url 
            } 
        });

    } catch (error) {
        console.error("Mail extraction error:", error.message);
        
        // Return 200 with 0 emails instead of 500 when website blocks/fails, since it's normal for lots of domains
        return res.status(200).json({ 
            success: true, 
            data: { 
                emails: [],
                count: 0,
                scrapedUrl: req.body.url,
                error: (error.code === 'ECONNABORTED' || error.name === 'AbortError') ? 'Timeout' : 'Site blocked scraping'
            } 
        });
    }
};
