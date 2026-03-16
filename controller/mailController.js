import axios from "axios";
import Joi from "joi";

const MAX_PAGES = 5;

const emailRegex =
/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}/gi;

const isValidEmail = (email) => {
    const invalidDomains = [
        "example.com","domain.com","test.com",
        "sentry.io","w3.org","wordpress.org",
        "cloudflare.com","schema.org"
    ];

    const lower = email.toLowerCase();
    const domain = lower.split("@")[1];

    if (!domain) return false;

    if (invalidDomains.some(d => domain.includes(d))) return false;

    if (lower.length > 60) return false;

    return true;
};

const decodeHtmlEntities = (str) => {
    return str
        .replace(/&#64;/g, "@")
        .replace(/&#46;/g, ".")
        .replace(/%40/g, "@");
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

const parseEmailsFromHtml = (html) => {

    let emails = [];

    if (!html) return emails;

    html = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "");

    html = decodeHtmlEntities(html);

    const matches = html.match(emailRegex) || [];
    emails.push(...matches);

    const mailtoRegex = /mailto:([^\?\"'>]+)/gi;
    let match;

    while ((match = mailtoRegex.exec(html)) !== null) {
        emails.push(match[1]);
    }

    const cfRegex = /data-cfemail="([a-f0-9]+)"/gi;

    while ((match = cfRegex.exec(html)) !== null) {
        const decoded = decodeCloudflareEmail(match[1]);
        emails.push(decoded);
    }

    const obfuscated = html.match(
        /([a-zA-Z0-9._%+-]+)\s?\[at\]\s?([a-zA-Z0-9.-]+)\s?\[dot\]\s?([a-zA-Z]{2,})/gi
    );

    if (obfuscated) {
        obfuscated.forEach(e => {
            const clean = e
                .replace(/\s?\[at\]\s?/i,"@")
                .replace(/\s?\[dot\]\s?/i,".");
            emails.push(clean);
        });
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

            if (
                url.includes("contact") ||
                url.includes("about") ||
                url.includes("team") ||
                url.includes("support") ||
                url.includes("privacy")
            ) {
                links.push(url);
            }

        } catch {}

    }

    return [...new Set(links)];
};

const schema = Joi.object({
    url: Joi.string().uri().required()
});

export const extractEmailsValidation = (req,res,next)=>{

    const {error} = schema.validate(req.body);

    if(error){
        return res.status(400).json({
            success:false,
            error:error.details[0].message
        });
    }

    next();
};

export const extractEmails = async (req,res)=>{

    try{

        const {url} = req.body;

        const visited = new Set();
        const emails = new Set();
        const queue = [url];

        while(queue.length && visited.size < MAX_PAGES){

            const page = queue.shift();

            if(visited.has(page)) continue;

            visited.add(page);

            try{

                const {data} = await axios.get(page,{
                    timeout:10000,
                    headers:{
                        "User-Agent":"Mozilla/5.0"
                    }
                });

                const foundEmails = parseEmailsFromHtml(data);

                foundEmails.forEach(e=>emails.add(e));

                const links = extractLinks(data,url);

                links.forEach(l=>{
                    if(!visited.has(l)) queue.push(l);
                });

            }catch(e){
                console.log("skip page",page);
            }

        }

        return res.json({
            success:true,
            data:{
                emails:[...emails],
                count:emails.size
            }
        });

    }catch(err){

        return res.json({
            success:true,
            data:{
                emails:[],
                count:0
            }
        });

    }

};