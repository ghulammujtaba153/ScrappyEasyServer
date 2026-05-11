import express from "express";
import { createTeamData, deleteTeamData, getTeamDataByTeamId, updateTeamData, bulkUpdateTeamData, assignLeadToTeam, bulkAssignLeadsToTeam } from "../controller/teamDataController.js";


const teamDataRouter = express.Router();

teamDataRouter.post("/create", createTeamData);
teamDataRouter.post("/assign", assignLeadToTeam);
teamDataRouter.post("/bulk-assign", bulkAssignLeadsToTeam);
teamDataRouter.get("/get/:teamId", getTeamDataByTeamId);
teamDataRouter.post("/bulk-update", bulkUpdateTeamData);
teamDataRouter.put("/update/:id", updateTeamData);
teamDataRouter.delete("/delete/:id", deleteTeamData);


export default teamDataRouter;