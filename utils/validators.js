import Joi from 'joi';

export const messageSchema = Joi.object({
    to: Joi.string()
        .pattern(/^[0-9]+$/)
        .min(10)
        .max(15)
        .required()
        .messages({
            'string.pattern.base': 'Phone number must contain only digits',
            'string.min': 'Phone number must be at least 10 digits',
            'string.max': 'Phone number must not exceed 15 digits',
            'any.required': 'Phone number is required'
        }),
    message: Joi.string()
        .min(1)
        .max(10000)
        .required()
        .messages({
            'string.min': 'Message must not be empty',
            'string.max': 'Message must not exceed 10000 characters',
            'any.required': 'Message is required'
        }),
    sessionId: Joi.string()
        .optional()
        .default('default'),
    mentions: Joi.array()
        .items(Joi.string().pattern(/^[0-9]+$/))
        .optional()
});

export const bulkMessageSchema = Joi.object({
    recipients: Joi.array()
        .items(
            Joi.string()
                .pattern(/^[0-9]+$/)
                .min(10)
                .max(15)
        )
        .min(1)
        .max(1000)
        .required()
        .messages({
            'array.min': 'At least one recipient is required',
            'array.max': 'Maximum 1000 recipients allowed',
            'any.required': 'Recipients array is required'
        }),
    message: Joi.string()
        .min(1)
        .max(10000)
        .required(),
    sessionId: Joi.string()
        .optional()
        .default('default'),
    options: Joi.object({
        delayBetweenMessages: Joi.number()
            .min(0)
            .max(60000)
            .default(1000),
        delayBetweenBatches: Joi.number()
            .min(0)
            .max(120000)
            .default(5000),
        batchSize: Joi.number()
            .min(1)
            .max(100)
            .default(10)
    }).optional()
});

export const validateMessageRequest = (data) => {
    const { error, value } = messageSchema.validate(data, { abortEarly: false });

    if (error) {
        return {
            valid: false,
            errors: error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }))
        };
    }

    return {
        valid: true,
        data: value
    };
};

export const validateBulkMessageRequest = (data) => {
    const { error, value } = bulkMessageSchema.validate(data, { abortEarly: false });

    if (error) {
        return {
            valid: false,
            errors: error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }))
        };
    }

    return {
        valid: true,
        data: value
    };
};