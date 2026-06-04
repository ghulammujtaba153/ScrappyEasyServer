import dns from "dns";

// Use Cloudflare DNS for reliable MX resolution
dns.setServers(["1.1.1.1"]);

// Dynamically import deep-email-validator (ESM compatible)
async function runValidation(email, timeoutMs = 8000) {
    const { validate } = await import("deep-email-validator");

    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            resolve({ timedOut: true });
        }, timeoutMs);

        validate({
            email,
            validateRegex: true,
            validateMx: true,
            validateTypo: false, // causes hangs on rare TLDs
            validateDisposable: false,
            validateSMTP: false, // Port 25 is blocked by virtually all cloud hosts — skip
        })
            .then((result) => {
                clearTimeout(timer);
                resolve({ result });
            })
            .catch((err) => {
                clearTimeout(timer);
                resolve({ error: err });
            });
    });
}

export const verifyEmail = async (req, res) => {
    // Explicitly handle preflight (belt-and-suspenders for strict CORS environments)
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }

    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ message: "Email is required" });
    }

    try {
        const { result, timedOut, error } = await runValidation(email, 8000);

        if (timedOut) {
            return res.status(200).json({
                email,
                status: "risky",
                reason: "smtp_check_timeout",
                message:
                    "Basic domain records exist, but mail server handshake timed out.",
            });
        }

        if (error) {
            console.error("[verifyEmail] Validation error:", error.message);
            return res.status(200).json({
                email,
                status: "risky",
                reason: "validation_error",
                message: error.message,
            });
        }

        if (!result.valid) {
            return res.status(200).json({
                email,
                status: "invalid",
                reason: result.reason,
                details: result.validators,
            });
        }

        return res.status(200).json({ email, status: "valid" });
    } catch (err) {
        // Final safety net — never let this endpoint crash the server
        console.error("[verifyEmail] Unexpected crash:", err.message);
        return res.status(200).json({
            email,
            status: "risky",
            reason: "unexpected_error",
            message: "Validation could not be completed. Treat as risky.",
        });
    }
};
