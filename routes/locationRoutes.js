import express from "express";
import { recommend_neighbors, find_city_neighbors, find_nearby_cities } from "../controller/locationController.js";

const locationRouter = express.Router();

locationRouter.get("/neighbors", recommend_neighbors);
locationRouter.get("/city-neighbors", find_city_neighbors);
locationRouter.get("/nearby-cities", find_nearby_cities);

export default locationRouter;
