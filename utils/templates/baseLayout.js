/**
 * Base Email Layout with Map Harvest Branding
 * @param {string} title - Email title/heading
 * @param {string} content - Main HTML content
 * @param {string} footerExtra - Optional extra footer text
 * @returns {string} - Full HTML email string
 */
export const baseLayout = (title, content, footerExtra = '') => {
  const primaryColor = "#0F792C";
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="ie=edge">
  <title>${title}</title>
  <style>
    /* Reset and Base Styles */
    body, html {
      margin: 0;
      padding: 0;
      background-color: #f4f7f6;
    }
    body {
      font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
      color: #334155;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    
    /* Container */
    .container {
      max-width: 600px;
      margin: 40px auto;
      background: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
      border: 1px solid rgba(0,0,0,0.04);
    }
    
    /* Header */
    .header {
      background: linear-gradient(135deg, ${primaryColor} 0%, #149339 100%);
      padding: 40px 30px;
      text-align: center;
      position: relative;
    }
    .header::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: rgba(255,255,255,0.2);
    }
    .header-content {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
    }
    .header-logo {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: #ffffff;
      padding: 4px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.1);
      object-fit: contain;
    }
    .header h1 {
      margin: 0;
      color: #ffffff;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: 0.5px;
      text-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    /* Content Area */
    .content {
      padding: 45px 40px;
      line-height: 1.7;
      font-size: 16px;
    }
    .content h2 {
      margin-top: 0;
      color: #0f172a;
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 24px;
    }
    .content p {
      margin-bottom: 20px;
    }

    /* Elements */
    .button {
      display: inline-block;
      padding: 14px 32px;
      background-color: ${primaryColor};
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 15px;
      margin: 25px 0;
      text-align: center;
      transition: all 0.2s ease;
      box-shadow: 0 4px 12px rgba(15, 121, 44, 0.25);
    }
    .button:hover {
      background-color: #0c6123;
      transform: translateY(-1px);
    }
    .highlight {
      color: ${primaryColor};
      font-weight: 700;
      background: rgba(15, 121, 44, 0.05);
      padding: 2px 6px;
      border-radius: 4px;
    }

    /* Footer */
    .footer {
      background-color: #f8fafc;
      padding: 30px 40px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    .footer-text {
      margin: 0 0 10px 0;
      font-size: 14px;
      color: #64748b;
      font-weight: 500;
    }
    .footer-subtext {
      margin: 0;
      font-size: 12px;
      color: #94a3b8;
    }
    .social-links {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
    }

    /* Responsive */
    @media only screen and (max-width: 600px) {
      .container {
        margin: 15px;
        width: auto;
      }
      .content {
        padding: 30px 20px;
      }
      .header {
        padding: 30px 20px;
      }
    }
  </style>
</head>
<body>
  <div style="background-color: #f4f7f6; padding: 20px 0; width: 100%;">
    <div class="container">
      <div class="header">
        <div class="header-content" style="display: block; text-align: center;">
          <img src="cid:logo" alt="Logo" class="header-logo" style="vertical-align: middle; margin-right: 12px; display: inline-block;">
          <h1 style="vertical-align: middle; display: inline-block;">Map Harvest</h1>
        </div>
      </div>
      <div class="content">
        <h2>${title}</h2>
        ${content}
      </div>
      <div class="footer">
        <p class="footer-text">Helping you grow your business through data.</p>
        <p class="footer-subtext">© ${new Date().getFullYear()} Map Harvest. All rights reserved.</p>
        ${footerExtra ? `<p class="footer-subtext" style="margin-top: 8px;">${footerExtra}</p>` : ''}
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
};
