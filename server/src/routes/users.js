// server/src/routes/Users.js
import { Router } from "express";
import requireAuth from "../middleware/requireAuth.js";
import { getMySubmissions } from "../controllers/usersController.js";

const r = Router();

r.get("/mypapers", requireAuth, getMySubmissions);

export default r;