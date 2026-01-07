import express from 'express';
import { createNotification, getNotificationsByUser, markNotificationAsRead, markAllNotificationsAsRead, deleteNotification } from '../controller/notificationController.js';

const notificationRouter = express.Router();
notificationRouter.post('/create', createNotification);
notificationRouter.get('/user/:userId', getNotificationsByUser);
notificationRouter.put('/mark-read/:notificationId', markNotificationAsRead);
notificationRouter.put('/mark-all-read/:userId', markAllNotificationsAsRead);
notificationRouter.delete('/delete/:notificationId', deleteNotification);

export default notificationRouter;
