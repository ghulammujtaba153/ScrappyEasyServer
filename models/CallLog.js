import mongoose from "mongoose";

const callLogSchema = new mongoose.Schema({
    callSid: { type: String, required: true, unique: true },
    from: { type: String },
    to: { type: String },
    direction: { type: String }, // inbound or outbound
    status: { type: String },
    recordingUrl: { type: String },
    duration: { type: String },
    timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

const CallLog = mongoose.model("CallLog", callLogSchema);

export default CallLog;
