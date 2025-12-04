import express from "express";
import cors from "cors";
import connectDB from "./database/db.js";
import dotenv from "dotenv";
import router from "./routes/index.js";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());


connectDB();

app.use("/api", router);

app.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
});
