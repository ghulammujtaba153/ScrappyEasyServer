import dotenv from "dotenv";
dotenv.config();
import twilio from "twilio";

const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

client.calls.create({
    to: "+923105403646",
    from: process.env.TWILIO_PHONE_NUMBER,
    url: "https://demo.twilio.com/docs/voice.xml"
})
    .then(() => console.log("Call started"))
    .catch(console.error);
