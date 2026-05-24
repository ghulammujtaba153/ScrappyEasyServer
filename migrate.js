// Quick migration script - run with: node migrate.js
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

const normalizeSubject = (subject) => {
  if (!subject) return "(no subject)";
  return subject.replace(/^(re:\s*|fwd?:\s*)+/i, "").trim().toLowerCase();
};

const makeThreadId = (subject, contactEmail) => {
  return `${normalizeSubject(subject)}::${contactEmail.toLowerCase()}`;
};

async function migrate() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");

  const collection = mongoose.connection.db.collection("mailmessages");
  const docs = await collection.find({ $or: [{ threadId: { $exists: false } }, { threadId: "" }] }).toArray();
  
  console.log(`Found ${docs.length} documents to migrate`);

  for (const doc of docs) {
    const threadId = makeThreadId(doc.subject, doc.contactEmail);
    await collection.updateOne({ _id: doc._id }, { $set: { threadId } });
    console.log(`  Updated: ${doc.subject} -> ${threadId}`);
  }

  console.log("Migration complete!");
  process.exit(0);
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
