import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

/* =======================
   PATH SETUP
======================= */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =======================
   SCREENSHOT CONTROLLER
======================= */
export const captureScreenshot = async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({
            success: false,
            message: "URL is required"
        });
    }

    let browser;

    try {
        console.log(`📸 Capturing FULL landing page: ${url}`);

        /* =======================
           LAUNCH BROWSER
        ======================= */
        browser = await chromium.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"]
        });

        const context = await browser.newContext({
            viewport: { width: 1440, height: 900 }, // Desktop width
            deviceScaleFactor: 1
        });

        const page = await context.newPage();

        /* =======================
           NAVIGATE
        ======================= */
        await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 60000
        });

        /* =======================
           FORCE FULL PAGE RENDER
           (Lazy loading, animations)
        ======================= */
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 400;
                const timer = setInterval(() => {
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= document.body.scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });

        // Scroll back to top for clean capture
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(1000);

        /* =======================
           FILE SETUP
        ======================= */
        const fileName = `screenshot-${Date.now()}.png`;
        const screenshotsDir = path.join(process.cwd(), "public/screenshots");

        if (!fs.existsSync(screenshotsDir)) {
            fs.mkdirSync(screenshotsDir, { recursive: true });
        }

        const filePath = path.join(screenshotsDir, fileName);

        /* =======================
           FULL PAGE SCREENSHOT
        ======================= */
        await page.screenshot({
            path: filePath,
            fullPage: true
        });

        console.log(`✅ Screenshot saved: ${fileName}`);

        return res.status(200).json({
            success: true,
            screenshotUrl: `/screenshots/${fileName}`,
            fileName
        });

    } catch (error) {
        console.error("❌ Screenshot capture failed:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to capture screenshot",
            error: error.message
        });

    } finally {
        if (browser) await browser.close();
    }
};
