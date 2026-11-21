import express from "express";
import {getUsers, syncContacts} from "../controllers/userController.js";

const router = express.Router();

router.get("/getAllUsers",getUsers);
router.post("/syncContacts", syncContacts);

export default router;
