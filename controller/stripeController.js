import Stripe from 'stripe';
import Package from '../models/packageSchema.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const createCheckoutSession = async (req, res) => {
    try {
        const { packageId, planName, price } = req.body;
        const userId = req.user?._id || req.body.userId;

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

        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'subscription',
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: productName,
                            description: productDescription,
                        },
                        unit_amount: unitAmount,
                        recurring: {
                            interval: packageData?.interval || 'month',
                        },
                    },
                    quantity: 1,
                },
            ],
            success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard/subscription`,
            metadata: {
                userId: userId?.toString() || '',
                packageId: packageId || '',
                planName: productName,
            },
        });

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
