/**
 * Standalone Resend connectivity test.
 * Run: node resend_test.js
 *
 * This bypasses the campaign system entirely and calls Resend directly.
 * Watch the output to confirm whether the API key / domain / recipient are valid.
 */
import { Resend } from "resend";
import dotenv from "dotenv";
dotenv.config();

const RESEND_API_KEY   = process.env.RESEND_API_KEY;
const RESEND_FROM      = process.env.RESEND_EMAIL_FROM;
// ✏️  Change this to YOUR own email address to receive the test
const TEST_RECIPIENT   = "ghulammujtaba.dro@gmail.com";

console.log("──────────────────────────────────────────");
console.log("🔑  RESEND_API_KEY :", RESEND_API_KEY ? `${RESEND_API_KEY.slice(0, 8)}...` : "❌ MISSING");
console.log("📨  FROM           :", RESEND_FROM   || "❌ MISSING");
console.log("📬  TO (test)      :", TEST_RECIPIENT);
console.log("──────────────────────────────────────────\n");

if (!RESEND_API_KEY || !RESEND_FROM) {
    console.error("❌ Aborting — missing RESEND_API_KEY or RESEND_EMAIL_FROM in .env");
    process.exit(1);
}

const resend = new Resend(RESEND_API_KEY);

async function runTest() {
    try {
        console.log("📤 Calling resend.emails.send() ...");
        const { data, error } = await resend.emails.send({
            from: `Map Harvest <${RESEND_FROM}>`,
            to: [TEST_RECIPIENT],
            subject: "✅ Resend Test — Map Harvest",
            html: `<h2>Resend is working!</h2>
                   <p>This is a connectivity test sent at <strong>${new Date().toISOString()}</strong>.</p>
                   <p>FROM: <code>${RESEND_FROM}</code></p>`,
            text: `Resend is working! Sent at ${new Date().toISOString()}. FROM: ${RESEND_FROM}`,
        });

        if (error) {
            console.error("\n❌  Resend returned an error:");
            console.error("    Name    :", error.name);
            console.error("    Message :", error.message);
            console.error("    Full    :", JSON.stringify(error, null, 2));
            process.exit(1);
        }

        console.log("\n✅  Email accepted by Resend!");
        console.log("    Email ID :", data.id);
        console.log("\n👉  Check your inbox at:", TEST_RECIPIENT);
        console.log("    (also check Spam / Promotions folder)\n");
    } catch (err) {
        console.error("\n❌  Unexpected exception thrown:");
        console.error("    Message :", err.message);
        console.error("    Stack   :", err.stack);
        process.exit(1);
    }
}

runTest();
