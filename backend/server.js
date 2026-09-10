import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import authRoutes from "./routes/authRoutes.js"
import { connectDB } from "./lib/db.js";
import cookieParser from "cookie-parser";
import chatRoutes from "./routes/chatRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import cors from "cors";

dotenv.config();
const app = express();
const port = process.env.PORT || 5001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.set("trust proxy", 1);

const extraOrigins = (process.env.FRONTEND_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:5001",
    "https://synkup.vercel.app",
    ...extraOrigins,
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // Exact match for CORS (required for credentials)
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}))
app.use(express.json());
app.use(cookieParser());
app.get("/api/health", (req, res) => {
    const dbState = ["disconnected", "connected", "connecting", "disconnecting"];
    res.json({
        ok: true,
        db: dbState[mongoose.connection.readyState] ?? "unknown",
    });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chat", chatRoutes);

const frontendDist = path.join(__dirname, "frontend/dist");
if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get(/^(?!\/api).*/, (req, res) => {
        res.sendFile(path.join(frontendDist, "index.html"));
    });
}

const startServer = async () => {
    try {
        await connectDB();
        app.listen(port, "0.0.0.0", () => {
            console.log(`Server is running on port ${port}`);
        });
    } catch (error) {
        console.error("Failed to start server:", error.message);
        process.exit(1);
    }
};

startServer();