import './config.js';
import app from './app.js';
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.js";

const port = process.env.PORT || 3001;
const server = app.listen(port, () => {
  console.log(`API listening on ${port}`);
});

app.use(cors({ origin: process.env.VITE_API_BASE_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/healthz", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);

app.listen(3005, () => console.log("IRCSET server on :3005"));

// Basic slowloris/abuse guardrails
server.requestTimeout = 30_000;   // 30s total per request
server.headersTimeout = 35_000;   // must exceed requestTimeout slightly
