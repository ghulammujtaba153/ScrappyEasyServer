import express from "express";
import { login, register, updateUser, verifyToken, resetPassword, inviteUser, getAllUsers, deleteUser, getUserProfile } from "../controller/authController.js";


const authRouter = express.Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.put("/update/:id", updateUser);
authRouter.get("/verifyToken", verifyToken);
authRouter.get("/profile/:id", getUserProfile);

authRouter.post("/reset-password", resetPassword);
authRouter.post("/invite-user", inviteUser);
authRouter.get("/users", getAllUsers);
authRouter.delete("/deleteUser/:id", deleteUser);

export default authRouter;
