import express from "express";
import { recommend_neighbors, find_city_neighbors } from "../controller/locationController.js";

const locationRouter = express.Router();

locationRouter.get("/neighbors", recommend_neighbors);
locationRouter.get("/city-neighbors", find_city_neighbors);

export default locationRouter;
