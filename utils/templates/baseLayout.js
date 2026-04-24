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
    body {
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f7fafc;
      color: #2d3748;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
      border: 1px solid #e2e8f0;
    }
    .header {
      background-color: ${primaryColor};
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      color: #ffffff;
      font-size: 24px;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    .content {
      padding: 40px 30px;
      line-height: 1.6;
    }
    .footer {
      background-color: #f8fafc;
      padding: 20px 30px;
      text-align: center;
      font-size: 13px;
      color: #718096;
      border-top: 1px solid #edf2f7;
    }
    .button {
      display: inline-block;
      padding: 12px 28px;
      background-color: ${primaryColor};
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      margin: 20px 0;
    }
    .highlight {
      color: ${primaryColor};
      font-weight: 600;
    }
    @media only screen and (max-width: 600px) {
      .container {
        margin: 20px 10px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="cid:logo" alt="Map Harvest Logo" style="max-height: 60px; width: auto;">
    </div>
    <div class="content">
      <h2 style="margin-top: 0; color: #1a202c; font-size: 20px;">${title}</h2>
      ${content}
    </div>
    <div class="footer">
      <p style="margin: 0;">© ${new Date().getFullYear()} Map Harvest. All rights reserved.</p>
      ${footerExtra ? `<p style="margin: 10px 0 0 0;">${footerExtra}</p>` : ''}
      <p style="margin: 10px 0 0 0;">Helping you grow your business through data.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
};
