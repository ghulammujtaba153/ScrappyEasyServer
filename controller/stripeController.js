import Stripe from 'stripe';
import Package from '../models/packageSchema.js';
import Subscription from '../models/subscriptionSchema.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const createCheckoutSession = async (req, res) => {
    try {
        const { packageId, planName, price, interval, userId } = req.body;

        // If packageId is provided, fetch from database
        let packageData = null;
        if (packageId) {
            packageData = await Package.findById(packageId);
        }

        // Use database price or fallback to provided price
        const unitAmount = packageData?.price 
            ? Math.round(packageData.price * 100) 
            : Math.round(price * 100);
        
        const productName = packageData?.name || planName;
        const productDescription = packageData?.description || `${planName} subscription plan`;
        
        // Get interval from package or request
        const billingInterval = packageData?.interval || interval || 'month';
        
        // Check if it's a one-time payment
        const isOneTime = billingInterval === 'one-time';

        // Build session configuration
        const sessionConfig = {
            payment_method_types: ['card'],
            mode: isOneTime ? 'payment' : 'subscription',
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: productName,
                            description: productDescription,
                        },
                        unit_amount: unitAmount,
                        ...(isOneTime ? {} : {
                            recurring: {
                                interval: billingInterval,
                            },
                        }),
                    },
                    quantity: 1,
                },
            ],
            success_url: `${process.env.STRIPE_REDIRECT_URL || 'http://localhost:5173'}/dashboard/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.STRIPE_REDIRECT_URL || 'http://localhost:5173'}/dashboard/subscription`,
            metadata: {
                userId: userId?.toString() || '',
                packageId: packageId || '',
                planName: productName,
                isOneTime: isOneTime.toString(),
            },
        };

        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create(sessionConfig);

        res.status(200).json({ 
            sessionId: session.id, 
            url: session.url 
        });
    } catch (error) {
        console.error('Stripe checkout error:', error);
        res.status(500).json({ 
            message: 'Error creating checkout session', 
            error: error.message 
        });
    }
};

export const getCheckoutSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        
        // If payment is successful, create subscription record
        if (session.payment_status === 'paid') {
            const { userId, packageId, planName, isOneTime } = session.metadata;
            
            // Check if subscription already exists for this session
            const existingSubscription = await Subscription.findOne({ 
                stripeSessionId: sessionId 
            });
            
            if (!existingSubscription && userId && packageId) {
                // Get package to determine billing interval
                const packageData = await Package.findById(packageId);
                const billingInterval = packageData?.interval || 'month';
                
                // Calculate end date based on billing interval
                const startDate = new Date();
                let endDate = new Date(startDate);
                
                if (isOneTime === 'true') {
                    // One-time payment - no expiration (set far future date or null)
                    endDate = null;
                } else {
                    switch (billingInterval) {
                        case 'day':
                            endDate.setDate(endDate.getDate() + 1);
                            break;
                        case 'week':
                            endDate.setDate(endDate.getDate() + 7);
                            break;
                        case 'month':
                            endDate.setMonth(endDate.getMonth() + 1);
                            break;
                        case 'year':
                            endDate.setFullYear(endDate.getFullYear() + 1);
                            break;
                        default:
                            endDate.setMonth(endDate.getMonth() + 1);
                    }
                }

                // Use findOneAndUpdate with upsert to prevent race condition duplicates
                await Subscription.findOneAndUpdate(
                    { stripeSessionId: sessionId },
                    {
                        $setOnInsert: {
                            user: userId,
                            package: packageId,
                            amount: session.amount_total / 100,
                            status: 'Active',
                            startDate: startDate,
                            endDate: endDate,
                            stripeSessionId: sessionId,
                            stripeCustomerId: session.customer,
                            stripeSubscriptionId: session.subscription || null,
                            isOneTime: isOneTime === 'true'
                        }
                    },
                    { upsert: true, new: true }
                );
            }
        }
        
        res.status(200).json({
            status: session.payment_status,
            customerEmail: session.customer_details?.email,
            amountTotal: session.amount_total / 100,
            metadata: session.metadata,
        });
    } catch (error) {
        console.error('Error retrieving session:', error);
        res.status(500).json({ 
            message: 'Error retrieving checkout session', 
            error: error.message 
        });
    }
};


