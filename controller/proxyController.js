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

    const startTime = Date.now();
    try {
        console.log(`[${new Date().toISOString()}] 🔄 Proxying: ${url}`);

        const httpsAgent = new https.Agent({
            rejectUnauthorized: false
        });

        // Use arraybuffer for faster processing of HTML and better handling of binary data
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            httpsAgent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            maxRedirects: 5,
            timeout: 20000, // 20 second timeout
            validateStatus: (status) => status >= 200 && status < 600
        });

        const fetchDuration = Date.now() - startTime;
        console.log(`[${new Date().toISOString()}] 📥 Fetched in ${fetchDuration}ms: ${url}`);

        // Set response headers
        const contentType = response.headers['content-type'] || 'text/html';
        res.setHeader('Content-Type', contentType);

        // Security overrides to allow iframe embedding
        res.setHeader('Content-Security-Policy', "frame-ancestors *; default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;");
        res.setHeader('X-Frame-Options', 'ALLOWALL');
        res.setHeader('Access-Control-Allow-Origin', '*');

        if (contentType.includes('text/html')) {
            let html = response.data.toString('utf-8');
            
            try {
                const urlObj = new URL(url);
                const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
                const baseTag = `<base href="${baseUrl}/">`;

                // Inject base tag and potentially optimize scripts
                if (html.toLowerCase().includes('<head>')) {
                    html = html.replace(/<head>/i, `<head>${baseTag}`);
                } else if (html.toLowerCase().includes('<html>')) {
                    html = html.replace(/<html[^>]*>/i, `$&<head>${baseTag}</head>`);
                } else {
                    html = `<!DOCTYPE html><html><head>${baseTag}</head><body>${html}</body></html>`;
                }

                // Optional: Force all scripts to be defer to avoid render blocking in the preview
                // html = html.replace(/<script\b([^>]*)>/gi, '<script $1 defer>');
            } catch (err) {
                console.warn('Base tag injection failed:', err.message);
            }

            res.send(html);
        } else {
            res.send(response.data);
        }

        const totalDuration = Date.now() - startTime;
        console.log(`[${new Date().toISOString()}] ✅ Proxy successful for ${url} (Total: ${totalDuration}ms)`);

    } catch (error) {
        const errorDuration = Date.now() - startTime;
        console.error(`[${new Date().toISOString()}] ❌ Proxy error for ${url} after ${errorDuration}ms:`, error.message);

        return res.status(error.response?.status || 500).json({
            success: false,
            message: 'Failed to proxy URL',
            error: error.message
        });
    }
};
