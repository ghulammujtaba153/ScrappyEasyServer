import Blog from "./models/BlogsSchema.js";
import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dns from "node:dns/promises";

dns.setServers(["1.1.1.1"]);
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = "https://mapharvest.live";

const staticPages = [
  { loc: "/", priority: "1.0" },
  { loc: "/pricing", priority: "0.8" },
  { loc: "/about", priority: "0.7" },
  { loc: "/who-wins", priority: "0.7" },
  { loc: "/get-extension", priority: "0.8" },
  { loc: "/demo-presentation", priority: "0.6" },
  { loc: "/lead-buddy-support", priority: "0.5" },
  { loc: "/lead-buddy-privacy", priority: "0.3" },
  { loc: "/term-conditions", priority: "0.3" },
  { loc: "/login", priority: "0.5" },
  { loc: "/register", priority: "0.5" },
  { loc: "/blogs", priority: "0.8" },
];

const generateSitemap = async () => {
  try {
    console.log("Connecting to MongoDB to fetch blog slugs...");
    await mongoose.connect(
      process.env.MONGO_URI || "mongodb://localhost:27017/mapharvest"
    );

    const blogs = await Blog.find({}, "slug updatedAt").lean();
    console.log(`Found ${blogs.length} blogs. Generating XML...`);

    const lastMod = new Date().toISOString().split("T")[0];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

    // Add Static Pages
    staticPages.forEach((page) => {
      xml += `  <url>
    <loc>${BASE_URL}${page.loc}</loc>
    <lastmod>${lastMod}</lastmod>
    <priority>${page.priority}</priority>
  </url>\n`;
    });

    // Add Dynamic Blog Pages
    blogs.forEach((blog) => {
      xml += `  <url>
    <loc>${BASE_URL}/blog/${blog.slug}</loc>
    <lastmod>${lastMod}</lastmod>
    <priority>0.6</priority>
  </url>\n`;
    });

    xml += `</urlset>`;

    const sitemapPath = path.join(__dirname, "../app/public/sitemap.xml");
    fs.writeFileSync(sitemapPath, xml);

    console.log(`✅ Success! Sitemap generated at: ${sitemapPath}`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Sitemap generation failed:", err);
    process.exit(1);
  }
};

generateSitemap();
