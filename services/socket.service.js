import { Server } from "socket.io";
import Collaboration from "../models/collaborationSchema.js";

// Store online users: { userId: { userId, name, email, socketId } }
const onlineUsers = new Map();

export const setupSocketIO = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on("connection", (socket) => {
        console.log(`🔌 Socket connected: ${socket.id}`);

        // User comes online
        socket.on("user_online", (userData) => {
            if (userData && userData.userId) {
                onlineUsers.set(userData.userId, {
                    userId: userData.userId,
                    name: userData.name,
                    email: userData.email,
                    socketId: socket.id,
                    connectedAt: new Date()
                });
                
                console.log(`👤 User online: ${userData.name} (${userData.userId})`);
                
                // Broadcast updated online users list to everyone
                io.emit("online_users_updated", getOnlineUsersList());
            }
        });

        // Get online users
        socket.on("get_online_users", () => {
            socket.emit("online_users_list", getOnlineUsersList());
        });

        // Send meeting request
        socket.on("send_meeting_request", async (data) => {
            try {
                const { senderId, senderName, receiverId, meetLink, message } = data;
                
                // Create collaboration in database
                const collaboration = new Collaboration({
                    participants: [senderId, receiverId],
                    meetLink,
                    message,
                    status: "pending"
                });
                await collaboration.save();

                // Get receiver's socket
                const receiver = onlineUsers.get(receiverId);
                
                if (receiver) {
                    // Send request to receiver in real-time
                    io.to(receiver.socketId).emit("meeting_request_received", {
                        collaborationId: collaboration._id,
                        senderId,
                        senderName,
                        meetLink,
                        message,
                        createdAt: collaboration.createdAt
                    });
                    
                    // Confirm to sender
                    socket.emit("meeting_request_sent", {
                        success: true,
                        collaborationId: collaboration._id,
                        message: "Meeting request sent successfully"
                    });
                } else {
                    // User offline - request saved but not delivered in real-time
                    socket.emit("meeting_request_sent", {
                        success: true,
                        collaborationId: collaboration._id,
                        message: "Request saved. User is offline and will see it when they come online."
                    });
                }
            } catch (error) {
                console.error("Error sending meeting request:", error);
                socket.emit("meeting_request_sent", {
                    success: false,
                    message: error.message
                });
            }
        });

        // Accept meeting request
        socket.on("accept_meeting_request", async (data) => {
            try {
                const { collaborationId, userId, userName } = data;
                
                // Update in database
                const collaboration = await Collaboration.findByIdAndUpdate(
                    collaborationId,
                    { status: "accepted" },
                    { new: true }
                );

                if (collaboration) {
                    // Find the sender
                    const senderId = collaboration.participants.find(
                        p => p.toString() !== userId
                    );
                    const sender = onlineUsers.get(senderId?.toString());

                    if (sender) {
                        io.to(sender.socketId).emit("meeting_request_response", {
                            collaborationId,
                            status: "accepted",
                            respondedBy: userName,
                            meetLink: collaboration.meetLink
                        });
                    }

                    socket.emit("response_sent", {
                        success: true,
                        status: "accepted",
                        meetLink: collaboration.meetLink
                    });
                }
            } catch (error) {
                console.error("Error accepting request:", error);
                socket.emit("response_sent", { success: false, message: error.message });
            }
        });

        // Decline meeting request
        socket.on("decline_meeting_request", async (data) => {
            try {
                const { collaborationId, userId, userName } = data;
                
                // Update in database
                const collaboration = await Collaboration.findByIdAndUpdate(
                    collaborationId,
                    { status: "declined" },
                    { new: true }
                );

                if (collaboration) {
                    // Find the sender
                    const senderId = collaboration.participants.find(
                        p => p.toString() !== userId
                    );
                    const sender = onlineUsers.get(senderId?.toString());

                    if (sender) {
                        io.to(sender.socketId).emit("meeting_request_response", {
                            collaborationId,
                            status: "declined",
                            respondedBy: userName
                        });
                    }

                    socket.emit("response_sent", {
                        success: true,
                        status: "declined"
                    });
                }
            } catch (error) {
                console.error("Error declining request:", error);
                socket.emit("response_sent", { success: false, message: error.message });
            }
        });

        // User disconnects
        socket.on("disconnect", () => {
            // Find and remove user by socket id
            for (const [odId, user] of onlineUsers.entries()) {
                if (user.socketId === socket.id) {
                    console.log(`👋 User offline: ${user.name}`);
                    onlineUsers.delete(odId);
                    break;
                }
            }
            
            // Broadcast updated online users
            io.emit("online_users_updated", getOnlineUsersList());
        });
    });

    return io;
};

// Helper function to get online users as array (excluding sensitive data)
const getOnlineUsersList = () => {
    return Array.from(onlineUsers.entries()).map(([odId, user]) => ({
        userId: odId,
        name: user.name,
        email: user.email,
        connectedAt: user.connectedAt
    }));
};

export default setupSocketIO;
