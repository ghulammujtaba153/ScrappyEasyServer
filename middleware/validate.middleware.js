import { validateMessageRequest } from '../utils/validators.js';

export const validateMessage = (req, res, next) => {
    const validation = validateMessageRequest(req.body);

    if (!validation.valid) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: validation.errors
        });
    }

    next();
};