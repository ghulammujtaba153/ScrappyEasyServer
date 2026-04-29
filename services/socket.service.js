import { Server } from "socket.io";
import Collaboration from "../models/collaborationSchema.js";

// Store online users: { userId: { userId, name, email, socketId } }
const onlineUsers = new Map();

export const setupSocketIO = (server) => {
    const allowedOrigins = [
        process.env.CLIENT_URL,
        'https://dashboard.mapharvest.live',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:5000',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5000'
    ].filter(Boolean);

    const io = new Server(server, {
        cors: {
            origin: (origin, callback) => {
                // Allow all local origins during development
                if (!origin || allowedOrigins.includes(origin)) {
                    callback(null, true);
                } else {
                    callback(null, true); // Allow for development
                }
            },
            methods: ["GET", "POST"],
            credentials: true,
            allowedHeaders: ["Content-Type", "Authorization"]
        },
        // Try WebSocket first, fall back to polling
        transports: ['websocket', 'polling'],
        allowEIO3: true,
        // Timeouts for stability
        pingTimeout: 60000,
        pingInterval: 25000,
        // Allow upgrades from polling to websocket
        allowUpgrades: true,
        // Cookie settings for CORS
        cookie: {
            name: 'io',
            httpOnly: true,
            sameSite: 'lax',
            path: '/socket.io'
        },
        // Connection state recovery
        connectionStateRecovery: {
            maxDisconnectionDuration: 2 * 60 * 1000,
            skipMiddlewares: true
        },
        // Compression settings for polling
        httpCompression: true,
        perMessageDeflate: {
            threshold: 1024
        }
    });

    io.on("connection", (socket) => {
        console.log(`🔌 Socket connected: ${socket.id}`);
        console.log(`📊 Current online users count: ${onlineUsers.size}`);
        console.log(`✅ Transport: ${socket.conn.transport.name}`);
        console.log(`📍 Remote address: ${socket.handshake.address}`);

        // Track transport changes
        socket.conn.on('upgrade', (transport) => {
            console.log(`📡 Socket ${socket.id} upgraded to ${transport.name}`);
        });

        socket.conn.on('error', (error) => {
            console.error(`❌ Socket ${socket.id} connection error:`, error);
        });

        // User comes online
        socket.on("user_online", (userData) => {
            if (userData && userData.userId) {
                // Check if user already exists with different socket
                const existingUser = onlineUsers.get(userData.userId);
                if (existingUser && existingUser.socketId !== socket.id) {
                    console.log(`🔄 User ${userData.name} reconnected, updating socket ID`);
                }
                
                onlineUsers.set(userData.userId, {
                    userId: userData.userId,
                    name: userData.name,
                    email: userData.email,
                    socketId: socket.id,
                    connectedAt: existingUser?.connectedAt || new Date()
                });
                
                console.log(`👤 User online: ${userData.name} (${userData.userId})`);
                console.log(`📊 Total online users: ${onlineUsers.size}`);
                
                // Broadcast updated online users list to everyone
                const usersList = getOnlineUsersList();
                console.log(`📡 Broadcasting online users:`, usersList.map(u => u.name));
                io.emit("online_users_updated", usersList);
            }
        });

        // Get online users
        socket.on("get_online_users", () => {
            const usersList = getOnlineUsersList();
            console.log(`📋 Sending online users list to ${socket.id}:`, usersList.map(u => u.name));
            socket.emit("online_users_list", usersList);
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
            let disconnectedUser = null;
            let userIdToRemove = null;

            for (const [userId, user] of onlineUsers.entries()) {
                if (user.socketId === socket.id) {
                    disconnectedUser = user;
                    userIdToRemove = userId;
                    break;
                }
            }

            if (disconnectedUser) {
                console.log(`👋 Socket disconnected: ${socket.id} (User: ${disconnectedUser.name})`);
                onlineUsers.delete(userIdToRemove);
                
                // Broadcast updated online users
                io.emit("online_users_updated", getOnlineUsersList());
            }
        });
    });

    // Log Socket.IO errors
    io.engine.on('connection_error', (error) => {
        console.error('🔌 Socket.IO Connection Error:', {
            code: error.code,
            message: error.message,
            stack: error.stack
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

// Get user's socket ID by userId
export const getUserSocketId = (userId) => {
    const user = onlineUsers.get(userId);
    return user?.socketId || null;
};

export default setupSocketIO;

