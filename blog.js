import Blog from "./models/BlogsSchema.js";
import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "node:dns/promises";

dns.setServers(["1.1.1.1"]);
dotenv.config();

// Comprehensive list of countries
const countries = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria",
  "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan",
  "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia",
  "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo (Democratic Republic)", "Congo (Republic)",
  "Costa Rica", "Côte d'Ivoire", "Croatia", "Cuba", "Cyprus", "Czechia", "Denmark", "Djibouti", "Dominica", "Dominican Republic",
  "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland",
  "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea",
  "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq",
  "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "North Korea",
  "South Korea", "Kosovo", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya",
  "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands",
  "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique",
  "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Macedonia",
  "Norway", "Oman", "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines",
  "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa",
  "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia",
  "Solomon Islands", "Somalia", "South Africa", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland",
  "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia",
  "Turkey", "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "Uruguay", "Uzbekistan",
  "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
];

const generateBlogContent = (countryName) => {
  const slug = `how-to-call-from-${countryName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-to-the-usa`;
  return {
    title: `How to Call from ${countryName} to the USA: The Ultimate Guide for Business Growth`,
    slug: slug,
    content: `
<div class="blog-post" style="line-height: 1.8; color: #444; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: auto;">
    <h1 style="color: #0F792C; font-size: 2.5rem; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px;">The Ultimate Guide: Calling the USA from ${countryName}</h1>

    <p style="font-size: 1.1rem;">
    If you're running a business in <strong>${countryName}</strong> and trying to tap into the US market, communication plays a critical role. Whether you're doing outreach, selling services, or generating leads through tools like <strong>MapHarvest</strong>, your ability to connect directly with prospects can significantly impact your growth.
    </p>

    <p>
    Traditional international calling methods from ${countryName} are often expensive, inefficient, and result in low response rates. To scale effectively, businesses need a smarter and more reliable solution.
    </p>

    <h2 style="color: #0F792C; margin-top: 35px; border-left: 5px solid #0F792C; padding-left: 15px;">
    The Challenges of Calling from ${countryName}
    </h2>

    <ul style="padding-left: 20px;">
        <li>High international per-minute costs</li>
        <li>Low answer rates due to unfamiliar international caller IDs</li>
        <li>Difficulty in tracking and scaling manual outreach</li>
        <li>Lack of integration with your lead generation tools</li>
    </ul>

    <h2 style="color: #0F792C; margin-top: 35px; border-left: 5px solid #0F792C; padding-left: 15px;">
    Why Smart Businesses Use Twilio with MapHarvest
    </h2>

    <p>
    Twilio allows you to call US customers using a <strong>local US number</strong> directly from your web browser. This improves trust and increases the likelihood of calls being answered.
    </p>

    <div style="background: #f9f9f9; padding: 25px; border-radius: 12px; border: 1px solid #eee; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #333;">Quick Setup Guide</h3>
        <p>To start calling like a local from ${countryName}, you just need to grab these keys from your <a href="https://www.twilio.com/console" target="_blank" style="color: #0F792C; font-weight: bold;">Twilio Console</a>:</p>
        <ul style="list-style-type: none; padding-left: 0;">
            <li style="margin-bottom: 10px;"><strong>Account SID & Auth Token:</strong> Your main account identifiers found on the dashboard.</li>
            <li style="margin-bottom: 10px;"><strong>TwiML App SID:</strong> Created under <em>Develop > Voice > TwiML Apps</em> to enable web calling.</li>
            <li style="margin-bottom: 10px;"><strong>API Key SID & Secret:</strong> Generated under <em>Account > API Keys</em> for secure SDK access.</li>
        </ul>
    </div>

    <h2 style="color: #0F792C; margin-top: 35px; border-left: 5px solid #0F792C; padding-left: 15px;">
    Step-by-Step Integration in MapHarvest
    </h2>

    <ol style="padding-left: 20px;">
        <li>Open <strong>Twilio Settings</strong> in your MapHarvest dashboard.</li>
        <li>Enter your credentials and click <strong>Verify</strong>.</li>
        <li><strong>Fetch Numbers</strong> to select your new US-based identity.</li>
        <li>Start calling leads scraped from Google Maps with a single click!</li>
    </ol>

    <h2 style="color: #0F792C; margin-top: 35px; border-left: 5px solid #0F792C; padding-left: 15px;">
    Conclusion
    </h2>

    <p>
    Expanding from ${countryName} into the US market is now easier than ever. By combining <strong>MapHarvest</strong> for precise lead generation with <strong>Twilio</strong> for seamless, local calling, you can build a global outreach system that actually converts.
    </p>

    <p style="text-align: center; margin-top: 40px;">
        <strong style="font-size: 1.2rem; color: #0F792C;">
        Bridge the distance. Start your global outreach today!
        </strong>
    </p>
</div>
`
  };
};

const blogs = countries.map(generateBlogContent);

const seedBlogs = async () => {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(
      process.env.MONGO_URI || "mongodb://localhost:27017/mapharvest"
    );

    console.log("Cleaning up old blog posts...");
    await Blog.deleteMany({});

    console.log(`Seeding ${blogs.length} dynamic blog posts for all countries...`);
    
    // Chunking to avoid potential issues with huge inserts
    const chunkSize = 50;
    for (let i = 0; i < blogs.length; i += chunkSize) {
      const chunk = blogs.slice(i, i + chunkSize);
      await Blog.insertMany(chunk);
      console.log(`Seeded chunk ${Math.floor(i / chunkSize) + 1}...`);
    }

    console.log("✅ All 196+ dynamic blogs have been successfully seeded!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  }
};

seedBlogs();