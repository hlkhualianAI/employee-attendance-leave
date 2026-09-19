import express from "express";
import { registerOAuthRoutes } from "../../server/_core/oauth";

const app = express();
registerOAuthRoutes(app);

export default app;
