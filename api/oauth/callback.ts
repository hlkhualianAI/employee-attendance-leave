import express from "express";
import { registerOAuthRoutes } from "../../server/_core/oauth.ts";

const app = express();
registerOAuthRoutes(app);

export default app;
