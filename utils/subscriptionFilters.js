/** Subscription fields live on User (planName, planAmount, planExpiry, planId, status, paymentScreenshot). */

export const planAmountSumExpr = {
    $sum: {
        $convert: {
            input: { $trim: { input: '$planAmount', chars: ' $' } },
            to: 'double',
            onError: 0,
            onNull: 0,
        },
    },
};

/** User has any subscription data on their profile */
export const hasSubscriptionFilter = () => ({
    $or: [
        { planId: { $exists: true, $nin: [null, ''] } },
        { planName: { $exists: true, $nin: [null, ''] } },
        { planAmount: { $exists: true, $nin: [null, ''] } },
    ],
});

export const hasPlanAmountFilter = () => ({
    planAmount: { $exists: true, $nin: [null, ''] },
});

export const notExpiredFilter = (now = new Date()) => ({
    $or: [{ planExpiry: { $exists: false } }, { planExpiry: null }, { planExpiry: { $gte: now } }],
});

export const expiredFilter = (now = new Date()) => ({
    planExpiry: { $exists: true, $ne: null, $lt: now },
});

/** Active user with a plan that has not expired */
export const activeSubscriptionFilter = (now = new Date()) => ({
    $and: [{ status: 'active' }, hasSubscriptionFilter(), notExpiredFilter(now)],
});

/** Awaiting admin approval (typically after payment upload) */
export const underReviewSubscriptionFilter = () => ({
    $and: [{ status: 'under_review' }, hasSubscriptionFilter()],
});

export const pendingPaymentFilter = () => ({
    $and: [
        { status: 'under_review' },
        { paymentScreenshot: { $exists: true, $nin: [null, ''] } },
        hasSubscriptionFilter(),
    ],
});

export const formatStatusLabel = (status) =>
    status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ') : 'Unknown';
