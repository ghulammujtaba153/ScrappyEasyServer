import bizSdk from 'facebook-nodejs-business-sdk';
import crypto from 'crypto';

const Content = bizSdk.Content;
const CustomData = bizSdk.CustomData;
const EventRequest = bizSdk.EventRequest;
const UserData = bizSdk.UserData;
const ServerEvent = bizSdk.ServerEvent;

/**
 * Hash data using SHA256 for Meta CAPI requirements
 */
const hashData = (data) => {
    if (!data) return null;
    return crypto.createHash('sha256').update(String(data).trim().toLowerCase()).digest('hex');
};

/**
 * Send event to Meta Conversions API (CAPI) using official SDK
 * @param {string} eventName - Standard Meta event name
 * @param {Object} user - User object containing email, name, etc.
 * @param {Object} customDataParams - Event specific data
 * @param {Object} req - Express request object for IP and User-Agent
 * @param {string} eventID - Unique ID for deduplication with browser pixel
 */
export const sendMetaCAPIEvent = async (eventName, user, customDataParams = {}, req = null, eventID = null) => {
    const access_token = process.env.ACCESS_TOKEN;
    const pixel_id = process.env.PIXEL_ID;

    if (!access_token || !pixel_id) {
        console.warn("⚠️ Meta Pixel ID or Access Token missing in backend .env");
        return;
    }

    bizSdk.FacebookAdsApi.init(access_token);

    try {
        // 1. Setup User Data
        const userData = new UserData()
            .setEmails([user.email]) // SDK handles hashing if you pass raw, but we'll be safe
            .setClientIpAddress(req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress) : null)
            .setClientUserAgent(req?.headers['user-agent'] || null);

        if (user.name) {
            const names = user.name.split(' ');
            userData.setFirstNames([names[0]]);
            if (names.length > 1) userData.setLastNames([names.slice(1).join(' ')]);
        }
        
        if (user.country) userData.setCountries([user.country.toLowerCase()]);

        // 2. Setup Custom Data
        const customData = new CustomData();
        if (customDataParams.value) customData.setValue(customDataParams.value);
        if (customDataParams.currency) customData.setCurrency(customDataParams.currency);
        if (customDataParams.content_name) customData.setContentName(customDataParams.content_name);
        if (customDataParams.content_category) customData.setContentCategory(customDataParams.content_category);
        
        if (customDataParams.contents) {
            const contents = customDataParams.contents.map(c => 
                new Content().setId(c.id).setQuantity(c.quantity).setItemPrice(c.item_price)
            );
            customData.setContents(contents);
        }

        // 3. Setup Server Event
        const serverEvent = new ServerEvent()
            .setEventName(eventName)
            .setEventTime(Math.floor(Date.now() / 1000))
            .setUserData(userData)
            .setCustomData(customData)
            .setActionSource('website');

        if (eventID) serverEvent.setEventId(eventID);
        if (req) serverEvent.setEventSourceUrl(`${req.protocol}://${req.get('host')}${req.originalUrl}`);

        // 4. Create and Execute Request
        const eventsData = [serverEvent];
        const eventRequest = new EventRequest(access_token, pixel_id).setEvents(eventsData);
        
        const response = await eventRequest.execute();
        console.log(`✅ Meta CAPI event '${eventName}' sent via SDK:`, response);
    } catch (error) {
        console.error(`❌ Meta CAPI Error [${eventName}]:`, error.message);
    }
};
