import express from "express";
import { recommend_neighbors, find_city_neighbors, find_nearby_cities, get_smart_recommendations } from "../controller/locationController.js";

const locationRouter = express.Router();

locationRouter.get("/neighbors", recommend_neighbors);
locationRouter.get("/city-neighbors", find_city_neighbors);
locationRouter.get("/nearby-cities", find_nearby_cities);
locationRouter.get("/smart-recommendations", get_smart_recommendations);

export default locationRouter;
