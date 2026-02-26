import express from 'express';
import { createTeam, deleteTeam, getTeamById, getTeams, getTeamsByMember, getTeamsByOwner, updateTeam } from '../controller/teamController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const teamRouter = express.Router();
teamRouter.use(authMiddleware);

teamRouter.post('/create', createTeam);
teamRouter.get('/get', getTeams);
teamRouter.get('/get/owner/:ownerId', getTeamsByOwner);  // must be before /get/:id
teamRouter.get('/get/member/:memberId', getTeamsByMember); // must be before /get/:id
teamRouter.get('/get/:id', getTeamById);
teamRouter.put('/update/:id', updateTeam);
teamRouter.delete('/delete/:id', deleteTeam);



export default teamRouter;