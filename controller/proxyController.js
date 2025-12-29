import axios from 'axios';
import https from 'https';

/**
 * Proxy URL Controller
 * Fetches external websites and strips security headers to allow iframe embedding
 */
export const proxyUrl = async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({
            success: false,
            message: 'URL parameter is required'
        });
    }

    try {
        console.log(`🔄 Proxying request for: ${url}`);

        // Create HTTPS agent that ignores SSL certificate errors
        const httpsAgent = new https.Agent({
            rejectUnauthorized: false // Bypass SSL certificate validation
        });

        // Fetch the target URL
        const response = await axios.get(url, {
            responseType: 'stream',
            httpsAgent, // Use custom agent for HTTPS requests
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'Cache-Control': 'max-age=0',
                'Referer': url // Add referer to appear more legitimate
            },
            maxRedirects: 5,
            timeout: 30000,
            validateStatus: function (status) {
                // Accept any status code to handle it manually
                return status >= 200 && status < 600;
            }
        });

        // Check if the response was successful
        if (response.status === 403) {
            console.log(`⚠️ Access forbidden (403) for: ${url}`);
            return res.status(403).json({
                success: false,
                message: 'Website blocked the request (403 Forbidden). This site has anti-bot protection.',
                error: 'Access Denied'
            });
        }

        if (response.status >= 400) {
            console.log(`⚠️ HTTP ${response.status} for: ${url}`);
            return res.status(response.status).json({
                success: false,
                message: `Website returned error: ${response.status}`,
                error: `HTTP ${response.status}`
            });
        }

        // Set response headers, copying safe headers from the original response
        res.setHeader('Content-Type', response.headers['content-type'] || 'text/html');

        // Copy other safe headers
        const safeHeaders = ['content-encoding', 'content-language', 'cache-control', 'expires'];
        safeHeaders.forEach(header => {
            if (response.headers[header]) {
                res.setHeader(header, response.headers[header]);
            }
        });

        // CRITICAL: Do NOT copy these security headers (they prevent iframe embedding)
        // - X-Frame-Options
        // - Content-Security-Policy
        // - X-Content-Type-Options

        console.log(`✅ Proxying successful for: ${url}`);

        // For HTML content, inject a base tag to fix relative URLs
        const contentType = response.headers['content-type'] || '';
        if (contentType.includes('text/html')) {
            // Convert stream to string
            let html = '';
            response.data.on('data', (chunk) => {
                html += chunk.toString();
            });

            response.data.on('end', () => {
                try {
                    // Extract the base URL (protocol + domain)
                    const urlObj = new URL(url);
                    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

                    // Inject base tag after <head> to fix relative URLs
                    const baseTag = `<base href="${baseUrl}/">`;

                    // Try to inject after <head> tag
                    if (html.toLowerCase().includes('<head>')) {
                        html = html.replace(/<head>/i, `<head>${baseTag}`);
                    } else if (html.toLowerCase().includes('<html>')) {
                        // If no head tag, inject after <html>
                        html = html.replace(/<html[^>]*>/i, `$&<head>${baseTag}</head>`);
                    } else {
                        // If no html tag, prepend to content
                        html = `<!DOCTYPE html><html><head>${baseTag}</head><body>${html}</body></html>`;
                    }

                    res.send(html);
                } catch (err) {
                    console.error('Error injecting base tag:', err);
                    res.send(html); // Send original HTML if injection fails
                }
            });

            response.data.on('error', (err) => {
                console.error('Stream error:', err);
                res.status(500).send('Error loading content');
            });
        } else {
            // For non-HTML content (images, CSS, JS), just stream it
            response.data.pipe(res);
        }

    } catch (error) {
        console.error(`❌ Proxy error for ${url}:`, error.message);

        return res.status(error.response?.status || 500).json({
            success: false,
            message: 'Failed to proxy URL',
            error: error.message
        });
    }
};
