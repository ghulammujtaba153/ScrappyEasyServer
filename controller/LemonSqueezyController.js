import axios from 'axios';
import crypto from 'crypto';
import Package from '../models/packageSchema.js';
import Subscription from '../models/subscriptionSchema.js';
import User from '../models/userSchema.js';

/**
 * Create a Lemon Squeezy Checkout URL
 */
export const createCheckout = async (req, res) => {
    try {
        const { variantId, userId } = req.body;

        if (!variantId) {
            return res.status(400).json({ success: false, message: "Variant ID is required" });
        }

        const response = await axios.post(
            'https://api.lemonsqueezy.com/v1/checkouts',
            {
                data: {
                    type: 'checkouts',
                    attributes: {
                        checkout_data: {
                            redirect_url: process.env.FRONTEND_URL || 'http://localhost:5173',
                            custom: {
                                user_id: userId,
                                variant_id: variantId
                            }
                        }
                    },
                    relationships: {
                        store: {
                            data: {
                                type: 'stores',
                                id: process.env.LEMON_SQUEEZY_STORE_ID
                            }
                        },
                        variant: {
                            data: {
                                type: 'variants',
                                id: variantId
                            }
                        }
                    }
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.LEMON_SQUEEZY_API_KEY}`,
                    'Content-Type': 'application/vnd.api+json',
                    'Accept': 'application/vnd.api+json'
                }
            }
        );

        res.status(200).json({
            success: true,
            url: response.data.data.attributes.url
        });
    } catch (error) {
        console.error('Lemon Squeezy Checkout Error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: "Error creating checkout",
            error: error.response?.data || error.message
        });
    }
};

/**
 * Handle Lemon Squeezy Webhooks
 */
export const LemonSqueezyWebhook = async (req, res) => {
    try {
        // Verification logic using raw body buffer
        const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
        const hmac = crypto.createHmac('sha256', secret);
        const digest = Buffer.from(hmac.update(req.rawBody).digest('hex'), 'utf8');
        const signature = Buffer.from(req.get('X-Signature') || '', 'utf8');

        if (!secret) {
            console.error('LEMON_SQUEEZY_WEBHOOK_SECRET is not set in .env');
            return res.status(500).send('Internal Server Error');
        }

        if (digest.length !== signature.length || !crypto.timingSafeEqual(digest, signature)) {
            console.warn('Webhook signature mismatch. Check secret.');
            return res.status(401).send('Invalid signature');
        }

        const event = req.body;
        const eventName = event.meta.event_name;
        const attributes = event.data.attributes;
        const customData = event.meta.custom_data;

        const userId = customData?.user_id;

        console.log(`Received Lemon Squeezy Webhook: ${eventName}`, { userId, variantId: attributes.variant_id || customData?.variant_id });

        if (eventName === 'order_created') {
            const lsOrderId = event.data.id;
            const amount = attributes.total / 100;
            const variantId = attributes.variant_id;

            const startDate = new Date();
            let endDate = null;

            // Simple heuristic or mapping for interval if not in payload directly in a clear way
            // Lemon Squeezy orders for subscriptions usually have a related subscription object
            // For now, we'll wait for the 'subscription_created' event if it's a subscription.
            // If it's a one-time order, we handle it here.
            
            await Subscription.findOneAndUpdate(
                { lsOrderId: lsOrderId },
                {
                    $setOnInsert: {
                        user: userId,
                        amount: amount,
                        status: 'Active',
                        startDate: startDate,
                        lsOrderId: lsOrderId,
                        lsVariantId: variantId,
                        isOneTime: true // Default to true, updated by subscription event if needed
                    }
                },
                { upsert: true, new: true }
            );
        } else if (eventName === 'subscription_created' || eventName === 'subscription_updated') {
            const lsSubscriptionId = event.data.id;
            const status = attributes.status === 'active' ? 'Active' : 'Cancelled';
            const endDate = new Date(attributes.renews_at || attributes.ends_at);
            const variantId = attributes.variant_id;

            await Subscription.findOneAndUpdate(
                { lsSubscriptionId: lsSubscriptionId },
                {
                    status: status,
                    endDate: endDate,
                    user: userId,
                    lsVariantId: variantId,
                    isOneTime: false
                },
                { upsert: true }
            );
        } else if (eventName === 'subscription_cancelled') {
             const lsSubscriptionId = event.data.id;
             await Subscription.findOneAndUpdate(
                 { lsSubscriptionId: lsSubscriptionId },
                 { status: 'Cancelled' }
             );
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('Lemon Squeezy Webhook Error:', error);
        res.status(500).send('Internal Server Error');
    }
};
