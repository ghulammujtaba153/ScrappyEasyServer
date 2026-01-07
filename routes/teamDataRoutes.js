import express from "express";
import { createTeamData, deleteTeamData, getTeamDataByTeamId, updateTeamData } from "../controller/teamDataController.js";


const teamDataRouter = express.Router();

teamDataRouter.post("/create", createTeamData);
teamDataRouter.get("/get/:teamId", getTeamDataByTeamId);
teamDataRouter.put("/update/:id", updateTeamData);
teamDataRouter.delete("/delete/:id", deleteTeamData);


export default teamDataRouter;