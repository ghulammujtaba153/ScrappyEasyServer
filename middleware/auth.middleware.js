const API_KEY = process.env.API_KEY;

export const apiKeyAuth = (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;

    if (!apiKey) {
        return res.status(401).json({
            success: false,
            message: 'API key is required'
        });
    }

    if (apiKey !== API_KEY) {
        return res.status(403).json({
            success: false,
            message: 'Invalid API key'
        });
    }

    next();
};