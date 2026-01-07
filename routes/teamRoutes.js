import express from 'express';
import { createTeam, deleteTeam, getTeamById, getTeams, getTeamsByMember, getTeamsByOwner, updateTeam } from '../controller/teamController.js';


const teamRouter = express.Router();

teamRouter.post('/create', createTeam);
teamRouter.get('/get', getTeams);
teamRouter.get('/get/:id', getTeamById);
teamRouter.get('/get/owner/:ownerId', getTeamsByOwner);
teamRouter.get('/get/member/:memberId', getTeamsByMember);
teamRouter.put('/update/:id', updateTeam);
teamRouter.delete('/delete/:id', deleteTeam);



export default teamRouter;