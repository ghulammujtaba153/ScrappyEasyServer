import express from "express";
import { login, register, updateUser, verifyToken, resetPassword, inviteUser, getAllUsers, deleteUser } from "../controller/authController.js";


const authRouter = express.Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.put("/updateUser/:id", updateUser);
authRouter.get("/verifyToken", verifyToken);
authRouter.post("/reset-password", resetPassword);
authRouter.post("/invite-user", inviteUser);
authRouter.get("/users", getAllUsers);
authRouter.delete("/deleteUser/:id", deleteUser);

export default authRouter;
