import { chromium } from 'playwright';

let browserInstance = null;

const getBrowser = async () => {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
  }
  return browserInstance;
};

export const analyzeStack = async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: 'URL is required' });
  }

  let context;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 }
    });
    
    const page = await context.newPage();

    await page.goto(url.startsWith('http') ? url : `https://${url}`, {
      waitUntil: 'domcontentloaded',
      timeout: 25000
    });

    const content = await page.content();
    const scripts = await page.evaluate(() => Array.from(document.querySelectorAll('script')).map(s => s.src || s.textContent));
    const metaTags = await page.evaluate(() => Array.from(document.querySelectorAll('meta')).map(m => (m.name || m.getAttribute('property') || '').toLowerCase() + ' ' + (m.content || '').toLowerCase()));
    
    const technologies = [];
    const opportunities = [];

    // --- DETECTION HELPERS ---
    const check = (pattern) => content.includes(pattern);
    const checkScripts = (pattern) => scripts.some(s => s.includes(pattern));
    const checkMeta = (pattern) => metaTags.some(m => m.includes(pattern));

    // 1. CMS & E-commerce
    const isShopify = check('Shopify.shop') || checkScripts('shopify');
    if (check('wp-content')) technologies.push({ name: 'WordPress', category: 'CMS', icon: 'wordpress' });
    if (isShopify) technologies.push({ name: 'Shopify', category: 'E-commerce', icon: 'shopify' });
    if (check('wix.com')) technologies.push({ name: 'Wix', category: 'CMS', icon: 'wix' });
    if (check('squarespace.com')) technologies.push({ name: 'Squarespace', category: 'CMS', icon: 'squarespace' });
    if (check('Magento_')) technologies.push({ name: 'Magento', category: 'E-commerce', icon: 'magento' });
    if (check('vtex.com')) technologies.push({ name: 'VTEX', category: 'E-commerce', icon: 'vtex' });
    
    // 2. Marketing, CRM & Email
    const hasKlaviyo = checkScripts('klaviyo');
    const hasHubSpot = checkScripts('js.hs-scripts.com') || checkScripts('hsq.push');
    const hasMailchimp = checkScripts('chimpstatic.com') || check('mc-embedded-subscribe');

    if (hasKlaviyo) technologies.push({ name: 'Klaviyo', category: 'Email Marketing', icon: 'klaviyo' });
    if (hasHubSpot) technologies.push({ name: 'HubSpot', category: 'CRM', icon: 'hubspot' });
    if (hasMailchimp) technologies.push({ name: 'Mailchimp', category: 'Email Marketing', icon: 'mailchimp' });
    if (checkScripts('activecampaign.com')) technologies.push({ name: 'ActiveCampaign', category: 'Email Marketing', icon: 'activecampaign' });

    // 3. Analytics & Conversion Tracking
    const hasMetaPixel = checkScripts('fbevents.js') || check('fbq(');
    const hasGTM = checkScripts('googletagmanager.com/gtm.js') || check('GTM-');
    const hasGA = checkScripts('google-analytics.com') || check('gtag(') || check('UA-') || check('G-');
    const hasTikTok = checkScripts('analytics.tiktok.com');
    const hasHotjar = checkScripts('static.hotjar.com');
    const hasClarity = checkScripts('clarity.ms');
    const hasCAPI = check('fb_capi') || check('conversions_api');

    if (hasMetaPixel) technologies.push({ name: 'Meta Pixel', category: 'Marketing', icon: 'facebook' });
    if (hasGTM) technologies.push({ name: 'Google Tag Manager', category: 'Analytics', icon: 'gtm' });
    if (hasGA) technologies.push({ name: 'Google Analytics', category: 'Analytics', icon: 'ga' });
    if (hasTikTok) technologies.push({ name: 'TikTok Pixel', category: 'Marketing', icon: 'tiktok' });
    if (hasHotjar) technologies.push({ name: 'Hotjar', category: 'Analytics', icon: 'hotjar' });
    if (hasClarity) technologies.push({ name: 'Microsoft Clarity', category: 'Analytics', icon: 'clarity' });

    // 4. Support & Live Chat
    const hasIntercom = checkScripts('intercomcdn.com');
    const hasZendesk = checkScripts('static.zdassets.com');
    const hasCrisp = checkScripts('client.crisp.chat');

    if (hasIntercom) technologies.push({ name: 'Intercom', category: 'Customer Support', icon: 'intercom' });
    if (hasZendesk) technologies.push({ name: 'Zendesk', category: 'Customer Support', icon: 'zendesk' });
    if (hasCrisp) technologies.push({ name: 'Crisp', category: 'Customer Support', icon: 'crisp' });
    if (checkScripts('tawk.to')) technologies.push({ name: 'Tawk.to', category: 'Customer Support', icon: 'tawkto' });

    // 5. Payments
    if (checkScripts('stripe.com')) technologies.push({ name: 'Stripe', category: 'Payments', icon: 'stripe' });
    if (checkScripts('paypal.com')) technologies.push({ name: 'PayPal', category: 'Payments', icon: 'paypal' });

    // 6. Security & Infrastructure
    if (checkScripts('cloudflare.com') || check('__cf_bm')) technologies.push({ name: 'Cloudflare', category: 'Security', icon: 'cloudflare' });

    // --- GENERATE OUTREACH OPPORTUNITIES ---
    if (!hasMetaPixel) {
      opportunities.push({
        tool: 'Meta Pixel',
        impact: 'High',
        message: 'Missing Meta Pixel: Client cannot track ad conversions or retarget visitors. Perfect for FB/IG ad services.'
      });
    } else if (!hasCAPI) {
      opportunities.push({
        tool: 'Meta CAPI',
        impact: 'Critical',
        message: 'Meta Pixel found but CAPI is missing. Client losing 30%+ data to iOS privacy. Sell them a tracking upgrade.'
      });
    }

    if (isShopify && !hasKlaviyo) {
      opportunities.push({
        tool: 'Klaviyo Email',
        impact: 'High',
        message: 'Using Shopify but no Klaviyo detected. They are missing out on high-converting email automation flows.'
      });
    }

    if (!hasHotjar && !hasClarity) {
      opportunities.push({
        tool: 'Conversion Optimization',
        impact: 'Medium',
        message: 'No heatmap or session recording tools found. They have no idea why users are dropping off.'
      });
    }

    if (!hasIntercom && !hasZendesk && !hasCrisp) {
        opportunities.push({
          tool: 'Live Support',
          impact: 'Low',
          message: 'No live chat detected. Adding a support widget could increase conversion rates significantly.'
        });
    }

    // Frameworks & Libraries
    if (check('_next/static')) technologies.push({ name: 'Next.js', category: 'Framework', icon: 'nextjs' });
    if (check('react.production') || check('react-dom')) technologies.push({ name: 'React', category: 'Library', icon: 'react' });
    if (check('tailwind.min.css') || check('tailwindcss')) technologies.push({ name: 'Tailwind CSS', category: 'CSS Framework', icon: 'tailwind' });

    await context.close();

    const uniqueTech = Array.from(new Set(technologies.map(t => t.name)))
      .map(name => technologies.find(t => t.name === name));

    res.json({
      success: true,
      data: {
        url,
        technologies: uniqueTech,
        opportunities,
        total: uniqueTech.length
      }
    });

  } catch (error) {
    if (context) await context.close();
    console.error('Stack Analysis Error:', error);
    res.status(500).json({ success: false, error: 'Failed to analyze website stack: ' + error.message });
  }
};
