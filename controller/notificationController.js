import Notification from "../models/notificationSchema.js";
import { getUserSocketId } from "../services/socket.service.js";

export const createNotification = async (req, res) => {
    try {
        const notification = new Notification(req.body);
        await notification.save();
        
        // Emit socket event for real-time notification
        const io = req.app.get('io');
        if (io) {
            io.emit('new_notification', notification);
        }
        
        res.status(201).json(notification);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Helper function to create and emit notification (can be used by other controllers)
export const sendNotification = async (io, userId, title, description) => {
    try {
        const notification = new Notification({
            user: userId,
            title,
            description
        });
        await notification.save();
        
        if (io) {
            // Get the user's socket ID and emit directly to them
            const socketId = getUserSocketId(userId.toString());
            console.log(`📤 Sending notification to user ${userId}, socketId: ${socketId}`);
            
            if (socketId) {
                // Emit directly to the specific user's socket
                io.to(socketId).emit('new_notification', {
                    ...notification.toObject(),
                    userId: userId
                });
                console.log(`✅ Notification sent to socket ${socketId}`);
            } else {
                console.log(`⚠️ User ${userId} is offline, notification saved but not delivered in real-time`);
            }
        }
        
        return notification;
    } catch (error) {
        console.error('Error sending notification:', error);
        return null;
    }
};


export const getNotificationsByUser = async (req, res) => {
    try {
        const notifications = await Notification.find({ user: req.params.userId }).sort({ createdAt: -1 });
        res.status(200).json(notifications);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};


export const markNotificationAsRead = async (req, res) => {
    try {
        const notification = await Notification.findByIdAndUpdate(
            req.params.notificationId,
            { isRead: true },
            { new: true }
        );
        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        res.status(200).json(notification);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// Mark all notifications as read for a user
export const markAllNotificationsAsRead = async (req, res) => {
    try {
        const { userId } = req.params;
        await Notification.updateMany(
            { user: userId, isRead: false },
            { isRead: true }
        );
        res.status(200).json({ message: 'All notifications marked as read' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

export const deleteNotification = async (req, res) => {
    try {
        const notification = await Notification.findByIdAndDelete(req.params.notificationId);
        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        res.status(200).json(notification);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}