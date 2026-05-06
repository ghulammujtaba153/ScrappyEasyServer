import axios from "axios";
import Joi from "joi";
import LeadData from "../models/leadDataSchema.js";
import { chromium } from "playwright";
import { sendMetaCAPIEvent } from "../utils/metaPixel.js";

const MAX_PAGES = 3;

// Regular expressions for social media URLs
const socialRegexes = {
    facebook: /(?:https?:\/\/)?(?:www\.)?(?:facebook\.com|fb\.com)\/[a-zA-Z0-9._-]+/i,
    instagram: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/[a-zA-Z0-9._-]+/i,
    linkedin: /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:company|in|pub|profile|posts)\/[a-zA-Z0-9_\-\/%]+/i,
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
        
        res.json({
            success: true,
            data: {
                socials: result.socials,
                emails: result.emails,
                count
            }
        });

        // Track Lead Enrichment via CAPI
        if (req.user && count > 0) {
            try {
                await sendMetaCAPIEvent('Lead', req.user, {
                    content_name: 'Single Social Enrichment',
                    content_category: 'Lead Discovery',
                    value: count
                }, req);
            } catch (capiError) {
                console.error("CAPI Error in extractSocials:", capiError.message);
            }
        }
        return;
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

        // Track Bulk Lead Enrichment via CAPI
        if (req.user && totalItemsFound > 0) {
            try {
                await sendMetaCAPIEvent('Lead', req.user, {
                    content_name: 'Bulk Social Enrichment',
                    content_category: 'Lead Discovery',
                    value: totalItemsFound
                }, req);
            } catch (capiError) {
                console.error("CAPI Error in bulkExtractSocials:", capiError.message);
            }
        }
    } catch (error) {
        console.error("Bulk extraction error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

async function discoverPersonnel(companyName, website) {
    // Normalize website: if it's a Google redirect (ad/clk) try to extract the real target
    if (!website) website = '';
    else {
        try {
            const parsed = new URL(website);
            const host = parsed.hostname || '';
            if (host.includes('google.')) {
                // Common redirect params used by Google ad/clk links
                const redirectParams = ['adurl', 'url', 'u', 'q', 'dest', 'd'];
                let extracted = '';
                for (const p of redirectParams) {
                    const v = parsed.searchParams.get(p);
                    if (v) { extracted = v; break; }
                }

                // Some ad URLs embed the target as adurl=encodedvalue somewhere in the raw string
                if (!extracted) {
                    const m = website.match(/adurl=([^&]+)/i);
                    if (m) extracted = m[1];
                }

                if (extracted) {
                    try { extracted = decodeURIComponent(extracted); } catch {}
                    // If the extracted value is itself a Google redirect, avoid loops
                    if (!/google\./i.test(extracted)) {
                        website = extracted;
                        console.log('🔁 [PERSONNEL DISCOVERY] Extracted redirect target from Google URL:', website);
                    } else {
                        // fallback: drop website so query won't include google redirect
                        console.log('⚠️ [PERSONNEL DISCOVERY] Extracted target is still a Google URL; dropping website for query');
                        website = '';
                    }
                } else {
                    console.log('⚠️ [PERSONNEL DISCOVERY] Website is a Google redirect and no target param found; proceeding without website domain');
                    website = '';
                }
            }
        } catch (e) {
            // If URL parsing fails, ignore and continue with companyName-only query
            website = '';
        }
    }

    const extractDomain = (url) => {
        try {
            const parsed = new URL(url);
            return parsed.hostname.replace(/^www\./, '');
        } catch {
            return '';
        }
    };

    const extractRealWebsite = (url) => {
        if (!url) return '';
        try {
            const parsed = new URL(url);
            const possibleParams = ["adurl", "url", "q", "u", "dest", "d"];
            for (const p of possibleParams) {
                const val = parsed.searchParams.get(p);
                if (val && val.startsWith('http')) {
                    try { return decodeURIComponent(val); } catch { return val; }
                }
            }

            // fallback: extract any http(s) substring that's not a google domain
            const match = url.match(/https?:\/\/[^&\s]+/g);
            if (match) {
                const found = match.find(u => !/google\./i.test(u));
                return found || '';
            }

            return '';
        } catch {
            return '';
        }
    };

    const normalizeLinkedInUrl = (url) => {
        if (!url) return '';
        let cleaned = url.trim();
        cleaned = cleaned.replace(/&.*$/, '');
        cleaned = cleaned.replace(/[),.;\]]+$/, '');
        if (!/^https?:\/\//i.test(cleaned)) cleaned = `https://${cleaned}`;
        return cleaned;
    };

    const isLinkedInProfileOrCompany = (url) => /linkedin\.com\/(in|company|pub|profile|posts)\//i.test(url || '');

    const extractGoogleOrganicLinks = (html) => {
        const results = [];

        const googleRedirectRegex = /\/url\?q=([^"&]+)/g;
        let match;
        while ((match = googleRedirectRegex.exec(html)) !== null) {
            try {
                const decoded = decodeURIComponent(match[1]);
                if (!/^https?:\/\//i.test(decoded)) continue;
                if (/google\.|webcache\.googleusercontent|accounts\.google/i.test(decoded)) continue;
                if (/support\.google|maps\.google|policies\.google/i.test(decoded)) continue;
                results.push(decoded.replace(/&.*$/, ''));
            } catch {}
        }

        const directUrlRegex = /https?:\/\/[^\s"'<>]+/gi;
        while ((match = directUrlRegex.exec(html)) !== null) {
            try {
                const link = match[0].replace(/[),.;\]]+$/, '');
                if (/google\.|webcache\.googleusercontent|accounts\.google/i.test(link)) continue;
                results.push(link);
                }
            catch {}
        }

        return [...new Set(results)];
    };

    const extractDuckDuckGoLinks = (html) => {
        const results = [];
        let match;

        // DuckDuckGo redirect links: /l/?uddg=<encoded_target>
        const ddgRedirectRegex = /href=["'](?:https?:\/\/duckduckgo\.com)?\/l\/\?[^"']*uddg=([^"'&]+)[^"']*["']/gi;
        while ((match = ddgRedirectRegex.exec(html)) !== null) {
            try {
                const decoded = decodeURIComponent(match[1]);
                if (/^https?:\/\//i.test(decoded)) {
                    results.push(decoded);
                }
            } catch {}
        }

        // Direct outbound links in result anchors
        const directAnchorRegex = /class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["']/gi;
        while ((match = directAnchorRegex.exec(html)) !== null) {
            try {
                const link = match[1];
                if (/^https?:\/\//i.test(link)) {
                    results.push(link);
                }
            } catch {}
        }

        return [...new Set(results)];
    };

    const rankLinkedInLinks = (links = []) => {
        const linkedinOnly = links
            .filter((link) => isLinkedInProfileOrCompany(link))
            .map((link) => normalizeLinkedInUrl(link));

        const unique = [...new Set(linkedinOnly)];

        // Score and sort by relevance (prefer person profiles and role hints).
        const scoreLink = (url) => {
            let score = 0;
            if (/linkedin\.com\/in\//i.test(url)) score += 50;
            if (/linkedin\.com\/company\//i.test(url)) score += 30;
            if (/\b(CEO|Founder|Co-?Founder|Owner|Managing Director|Director)\b/i.test(url)) score += 10;
            // small boost for exact company name presence
            if (companyName && url.toLowerCase().includes(companyName.toLowerCase().replace(/\s+/g, '-')) ) score += 5;
            return score;
        };

        unique.sort((a, b) => scoreLink(b) - scoreLink(a));

        return unique.slice(0, 5);
    };

    const searchGoogleInBrowser = async (query) => {
        let browser;

        try {
            browser = await chromium.launch({
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox"]
            });

            const context = await browser.newContext({
                viewport: { width: 1440, height: 900 },
                userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            });

            const page = await context.newPage();
            const searchUrl = `https://www.google.com/search?hl=en&num=10&gbv=1&q=${encodeURIComponent(query)}`;

            await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
            await page.waitForTimeout(1500);

            const links = await page.evaluate(() => {
                const anchors = Array.from(document.querySelectorAll("a"));

                return anchors.map((a) => ({
                    href: a.href,
                    text: (a.innerText || "").trim()
                }));
            });

            // Helper: clean Google redirect URLs (/url?q=...)
            const cleanGoogleUrl = (url) => {
                try {
                    const u = new URL(url, 'https://www.google.com');
                    if (u.hostname && u.pathname === '/url') {
                        const real = u.searchParams.get('q') || u.searchParams.get('url') || u.searchParams.get('adurl');
                        if (real) return decodeURIComponent(real);
                    }
                    return url;
                } catch {
                    return url;
                }
            };

            // Clean links first so LinkedIn survives before any filtering
            const cleaned = links
                .map((l) => ({
                    href: cleanGoogleUrl(l.href),
                    text: l.text
                }))
                .filter((l) => l.href && l.href.startsWith("http"));

            // Extract LinkedIn FIRST (before filtering kills them)
            const linkedinLinks = cleaned
                .map((l) => l.href)
                .filter((link) => /linkedin\.com\/(in|company|pub|profile)/i.test(link));

            // General filtering, but do not reject any google redirect too early
            const filtered = cleaned
                .map((l) => l.href)
                .filter((link) =>
                    !link.includes("accounts.google") &&
                    !link.includes("support.google") &&
                    !link.includes("policies.google") &&
                    !link.includes("maps.google")
                );

            const all = [...new Set([...linkedinLinks, ...filtered])];

            console.log(`🔎 Query: ${query}`);
            console.log(`➡️ Total links: ${all.length}`);
            console.log(`🔗 LinkedIn found: ${linkedinLinks.length}`);

            console.log('   🪵 [PERSONNEL DISCOVERY] Raw browser anchors:');
            links.slice(0, 20).forEach((l, i) => {
                console.log(`      ${i + 1}. ${l.href} -- ${l.text.substring(0, 120)}`);
            });

            if (linkedinLinks.length) {
                console.log('✅ LinkedIn links:');
                linkedinLinks.slice(0, 5).forEach((l, i) => {
                    console.log(`   ${i + 1}. ${l}`);
                });
            }

            return all;
        } finally {
            if (browser) await browser.close();
        }
    };

    const searchBing = async (query) => {

        const decodeHtml = (value = '') => value
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');

        const decodeBingUParam = (uParam = '') => {
            let candidate = uParam;
            try { candidate = decodeURIComponent(candidate); } catch {}

            // Bing often prefixes encoded payload with a marker such as "a1"
            if (/^a1/i.test(candidate)) candidate = candidate.slice(2);

            if (/^https?:\/\//i.test(candidate)) return candidate;

            const tryBase64Decode = (input) => {
                try {
                    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
                    const padded = normalized + '==='.slice((normalized.length + 3) % 4);
                    const decoded = Buffer.from(padded, 'base64').toString('utf8');
                    return /^https?:\/\//i.test(decoded) ? decoded : '';
                } catch {
                    return '';
                }
            };

            return tryBase64Decode(candidate) || '';
        };

        const normalizeBingHref = (href = '') => {
            const cleaned = decodeHtml(href).trim();
            if (!cleaned) return '';

            try {
                const u = new URL(cleaned, 'https://www.bing.com');

                // Convert Bing tracking redirects to real destination when possible.
                if (u.hostname.includes('bing.com') && u.pathname.startsWith('/ck/a')) {
                    const uParam = u.searchParams.get('u') || '';
                    const decoded = decodeBingUParam(uParam);
                    if (decoded) return decoded;
                    return '';
                }

                // Ignore Bing internal navigation URLs.
                if (u.hostname.includes('bing.com')) {
                    return '';
                }

                return u.href;
            } catch {
                return '';
            }
        };

        try {
            const res = await axios.get('https://www.bing.com/search', {
                params: { q: query },
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 10000
            });

            const html = decodeHtml(res.data || '');
            const links = [];

            // Prioritize organic result anchors.
            const organicRegex = /<li[^>]*class="[^"]*b_algo[^"]*"[\s\S]*?<a[^>]+href="([^"]+)"/gi;
            let m;
            while ((m = organicRegex.exec(html)) !== null) {
                const normalized = normalizeBingHref(m[1]);
                if (normalized) links.push(normalized);
            }

            // Fallback broader anchor extraction.
            if (!links.length) {
                const anchorRegex = /<a[^>]+href="([^"]+)"/gi;
                while ((m = anchorRegex.exec(html)) !== null) {
                    const normalized = normalizeBingHref(m[1]);
                    if (normalized) links.push(normalized);
                }
            }

            return [...new Set(links)];
        } catch (e) {
            console.log('⚠️ [PERSONNEL DISCOVERY] Bing search failed:', e.message);
            return [];
        }
    };

    try {
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        };

        // Use exactly two queries: one for company page, one for owner/executive discovery
        const base = (companyName || '').trim();

        // Normalize potential Google ad redirect to a real website if present
        const realSite = extractRealWebsite(website) || website || '';
        if (realSite) {
            website = realSite;
            console.log('🔁 [PERSONNEL DISCOVERY] Using extracted real website for site-first crawl:', website);
        }

        const companyQuery = base ? `${base} linkedin` : '';
        const peopleQuery = base ? `${base} owner executive manager site:linkedin.com` : '';
        const queries = [];
        if (companyQuery) queries.push(companyQuery);
        if (peopleQuery) queries.push(peopleQuery);
        const query = companyQuery || peopleQuery || '';

        console.log(`🔍 [PERSONNEL DISCOVERY] Queries: ${queries.join(' | ')}`);

        let allLinks = [];
        let seen = new Set();
        let searchProvider = 'google-browser';
        const perQueryLinks = {};

        // Site-first crawl: if we have a website, try extracting socials from it before searching
        if (website) {
            try {
                console.log(`🌐 [PERSONNEL DISCOVERY] Crawling website first: ${website}`);
                const siteResult = await performExtraction(website);
                // Collect LinkedIn anchors from homepage and from performExtraction results
                let siteLinkedIns = [];
                try {
                    const { data: homepage } = await axios.get(website, { timeout: 8000, headers });
                    const hrefRegex = /href=["']([^"']+)["']/gi;
                    let m;
                    while ((m = hrefRegex.exec(homepage)) !== null) {
                        try {
                                    const resolved = new URL(m[1], website).href;
                                    if (isLinkedInProfileOrCompany(resolved)) siteLinkedIns.push(normalizeLinkedInUrl(resolved));
                        } catch {}
                    }
                } catch (e) {
                    // ignore homepage fetch errors
                }

                // include any linkedin found by performExtraction
                if (siteResult && siteResult.socials && siteResult.socials.linkedin) {
                    siteLinkedIns.push(normalizeLinkedInUrl(siteResult.socials.linkedin));
                }

                // dedupe
                siteLinkedIns = [...new Set(siteLinkedIns)];

                if (siteLinkedIns.length) {
                    // register site-crawl results but continue with search queries to find people
                    perQueryLinks['site-crawl'] = siteLinkedIns;
                    for (const l of siteLinkedIns) {
                        if (!seen.has(l)) { seen.add(l); allLinks.push(l); }
                    }

                    console.log('✅ [PERSONNEL DISCOVERY] Found LinkedIn via site crawl (will also run queries):', siteLinkedIns[0]);
                    console.log(`   🔗 [PERSONNEL DISCOVERY] All LinkedIn links from site: ${siteLinkedIns.join(' | ')}`);
                    console.log(`   🔍 [PERSONNEL DISCOVERY] Queries (company then people): ${companyQuery} | ${peopleQuery}`);
                } else {
                    console.log('ℹ️ [PERSONNEL DISCOVERY] Site crawl did not reveal LinkedIn links');
                }
            } catch (e) {
                console.log('⚠️ [PERSONNEL DISCOVERY] Site crawl failed:', e.message);
            }
        }

        // Bing search first: it is much less likely to hit a bot wall than Google.
        for (const q of queries) {
            try {
                console.log(`🚀 [PERSONNEL DISCOVERY] Bing query: ${q}`);
                const res = await searchBing(q);
                console.log(`   ✅ [PERSONNEL DISCOVERY] Bing returned ${res.length} links for query`);
                for (const l of res) {
                    if (!seen.has(l)) { seen.add(l); allLinks.push(l); }
                }
                perQueryLinks[q] = perQueryLinks[q] || [];
                perQueryLinks[q].push(...res);
                if (res.length) searchProvider = 'bing';
            } catch (err) {
                console.log(`   ⚠️ [PERSONNEL DISCOVERY] Bing query failed: ${err.message}`);
            }
        }

        // DuckDuckGo HTML fallback across queries
        if (!allLinks.length) {
            console.log('⚠️ [PERSONNEL DISCOVERY] Bing returned 0 links; trying DuckDuckGo HTML fallback');
            for (const q of queries) {
                try {
                    const ddgResponse = await axios.get('https://html.duckduckgo.com/html/', {
                        params: { q },
                        timeout: 12000,
                        headers
                    });
                    const ddgLinks = extractDuckDuckGoLinks(ddgResponse.data || '');
                    console.log(`   ✅ [PERSONNEL DISCOVERY] DuckDuckGo returned ${ddgLinks.length} links for query: ${q}`);
                    for (const l of ddgLinks) {
                        if (!seen.has(l)) { seen.add(l); allLinks.push(l); }
                    }
                    perQueryLinks[q] = perQueryLinks[q] || [];
                    perQueryLinks[q].push(...ddgLinks);
                    if (ddgLinks.length) searchProvider = 'duckduckgo-html';
                } catch (fallbackError) {
                    console.log(`   ⚠️ [PERSONNEL DISCOVERY] DuckDuckGo failed for query ${q}: ${fallbackError.message}`);
                }
            }
        }

        // Google HTML fallback across queries
        if (!allLinks.length) {
            console.log('⚠️ [PERSONNEL DISCOVERY] DuckDuckGo returned 0 links; trying Google HTML fallback');
            for (const q of queries) {
                try {
                    const googleResponse = await axios.get('https://www.google.com/search', {
                        params: { q, num: 10, hl: 'en', gbv: 1 },
                        timeout: 12000,
                        headers
                    });
                    const links = extractGoogleOrganicLinks(googleResponse.data || '');
                    console.log(`   ✅ [PERSONNEL DISCOVERY] Google HTML returned ${links.length} links for query: ${q}`);
                    for (const l of links) {
                        if (!seen.has(l)) { seen.add(l); allLinks.push(l); }
                    }
                    perQueryLinks[q] = perQueryLinks[q] || [];
                    perQueryLinks[q].push(...links);
                    if (links.length) searchProvider = 'google-html';
                } catch (googleHtmlError) {
                    console.log(`   ⚠️ [PERSONNEL DISCOVERY] Google HTML failed for query ${q}: ${googleHtmlError.message}`);
                }
            }
        }

        // Google browser fallback last, only if other engines produced nothing useful.
        if (!allLinks.length) {
            console.log('⚠️ [PERSONNEL DISCOVERY] All HTML engines returned 0 links; trying Google browser last');
            for (const q of queries) {
                try {
                    console.log(`🚀 [PERSONNEL DISCOVERY] Browser Google query: ${q}`);
                    const res = await searchGoogleInBrowser(q);
                    console.log(`   ✅ [PERSONNEL DISCOVERY] Browser returned ${res.length} anchors for query`);
                    for (const l of res) {
                        if (!seen.has(l)) { seen.add(l); allLinks.push(l); }
                    }
                    perQueryLinks[q] = perQueryLinks[q] || [];
                    perQueryLinks[q].push(...res);
                    if (res.length) searchProvider = 'google-browser';
                } catch (err) {
                    console.log(`   ⚠️ [PERSONNEL DISCOVERY] Browser query failed: ${err.message}`);
                }
            }
        }

        const topGoogleResult = allLinks.find((link) => /^https?:\/\//i.test(link) && !/(^https?:\/\/)?([a-z0-9-]+\.)*bing\.com\//i.test(link)) || allLinks[0] || '';

        // Prefer person results from the peopleQuery, then company results from the companyQuery
        const companyLinks = (typeof companyQuery !== 'undefined') ? (perQueryLinks[companyQuery] || []) : [];
        const personLinks = (typeof peopleQuery !== 'undefined') ? (perQueryLinks[peopleQuery] || []) : [];

        const personResults = rankLinkedInLinks(personLinks || []);
        const companyResults = rankLinkedInLinks(companyLinks || []);

        // Include any other ranked linkedin results as tertiary fallback
        const fallbackResults = rankLinkedInLinks(allLinks || []);

        // If Google query result links were found, prefer them over site-crawl-only links when ranking
        const queryLinkedInResults = rankLinkedInLinks([
            ...(personLinks || []),
            ...(companyLinks || []),
            ...(perQueryLinks[query] || [])
        ]);

        const merged = [...new Set([...(queryLinkedInResults || []), ...(personResults || []), ...(companyResults || []), ...(fallbackResults || [])])];
        const topLinkedInResults = merged.slice(0, 10);
        const firstLinkedIn = topLinkedInResults[0] || '';

        // Log per-query linkedin links (company & people) for debugging
        try {
            console.log('   📚 [PERSONNEL DISCOVERY] Per-query LinkedIn results:');
            for (const k of Object.keys(perQueryLinks)) {
                const list = (perQueryLinks[k] || []).filter(u => /linkedin\.com\//i.test(u)).map(normalizeLinkedInUrl);
                if (list.length) console.log(`      - ${k}: ${list.join(' | ')}`);
            }
        } catch {}

        console.log(`🧭 [PERSONNEL DISCOVERY] Search provider used: ${searchProvider}`);
        console.log(`🔎 [PERSONNEL DISCOVERY] Top Google result: ${topGoogleResult || 'None'}`);
        if (topLinkedInResults.length) {
            console.log(`🔗 [PERSONNEL DISCOVERY] Top LinkedIn matches:`);
            topLinkedInResults.forEach((link, index) => {
                console.log(`   ${index + 1}. ${link}`);
            });
        } else {
            console.log(`🔗 [PERSONNEL DISCOVERY] No LinkedIn profile/company links found in top results`);
        }

        const people = topLinkedInResults.map((link, index) => ({
            name: companyName || 'Company Profile',
            title: `LinkedIn Match ${index + 1}`,
            role: /linkedin\.com\/in\//i.test(link) ? 'Profile Match' : 'Company Match',
            email: '',
            phone: '',
            location: '',
            source: 'Google Search',
            linkedin: link
        }));

        return { people, firstLinkedIn, topGoogleResult, topLinkedInResults, query, searchProvider };
    } catch (error) {
        console.error("❌ [PERSONNEL DISCOVERY] Google lookup failed:", error.message);
        return { people: [], firstLinkedIn: '', topGoogleResult: '', topLinkedInResults: [], query: '', searchProvider: 'google' };
    }
}

export const getLinkedInInfo = async (req, res) => {
    try {
        const { leadId, website, companyName } = req.body;
        
        console.log(`\n--- [PERSONNEL REQUEST START] ---`);
        console.log(`Lead ID: ${leadId}`);
        console.log(`Company: ${companyName}`);
        console.log(`Website: ${website}`);

        if (!leadId) {
            console.log(`❌ [PERSONNEL REQUEST ERROR] Missing Lead ID`);
            return res.status(400).json({ success: false, message: "Lead ID is required" });
        }

        console.log(`🚀 [PERSONNEL REQUEST] Discovering LinkedIn via Google...`);
        const { people, firstLinkedIn, topGoogleResult, topLinkedInResults, query, searchProvider } = await discoverPersonnel(companyName, website);

        console.log(`🔍 [PERSONNEL REQUEST] Query used: ${query}`);

        console.log(`📊 [PERSONNEL REQUEST END] Found ${people.length} team members`);
        console.log(`-------------------------------\n`);

        return res.json({
            success: true,
            data: people,
            firstLinkedIn,
            topGoogleResult,
            topLinkedInResults,
            query,
            searchProvider
        });

    } catch (error) {
        console.error("❌ [PERSONNEL REQUEST FATAL ERROR]:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
