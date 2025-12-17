/**
 * Format phone number to international format
 */
export const formatPhoneNumber = (number, countryCode = '91') => {
    // Remove all non-numeric characters
    const cleanNumber = number.replace(/\D/g, '');

    // Remove leading zero if present
    const normalized = cleanNumber.startsWith('0') ? cleanNumber.slice(1) : cleanNumber;

    // Add country code if not present
    if (!normalized.startsWith(countryCode)) {
        return countryCode + normalized;
    }

    return normalized;
};

/**
 * Validate phone number
 */
export const isValidPhoneNumber = (number) => {
    const phoneRegex = /^[0-9]{10,15}$/;
    return phoneRegex.test(number.replace(/\D/g, ''));
};

/**
 * Generate unique message ID
 */
export const generateMessageId = () => {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Calculate message delivery delay
 */
export const calculateDelay = (index, baseDelay = 1000, maxDelay = 5000) => {
    const delay = baseDelay + (index * 200);
    return Math.min(delay, maxDelay);
};