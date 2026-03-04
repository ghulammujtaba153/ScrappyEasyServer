import express from "express";
import { 
    login, register, updateUser, verifyToken, resetPassword, 
    inviteResetPassword, inviteUser, getAllUsers, deleteUser, 
    getUserProfile, confirmInvitation, verifyInvitationToken 
} from "../controller/authController.js";

const authRouter = express.Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.put("/update/:id", updateUser);
authRouter.get("/verifyToken", verifyToken);
authRouter.get("/profile/:id", getUserProfile);

authRouter.post("/reset-password", resetPassword);
authRouter.post("/invite-reset-password/:token", inviteResetPassword);
authRouter.post("/invite-user", inviteUser);
authRouter.get("/users", getAllUsers);
authRouter.delete("/deleteUser/:id", deleteUser);

// Invitation confirmation
authRouter.get("/verify-invitation/:token", verifyInvitationToken);
authRouter.post("/confirm-invitation", confirmInvitation);

export default authRouter;
