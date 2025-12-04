import express from "express";
import { login, register, updateUser, verifyToken, resetPassword } from "../controller/authController.js";


const authRouter = express.Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.put("/updateUser/:id", updateUser);
authRouter.get("/verifyToken", verifyToken);
authRouter.post("/reset-password", resetPassword);

export default authRouter;
