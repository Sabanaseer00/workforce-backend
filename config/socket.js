import { Server } from "socket.io";
import jwt from "jsonwebtoken";

let io;

const ALLOWED_ORIGINS = [
  "https://workforce-frontend-ten.vercel.app",
  "https://workforce-productivity-5163.vercel.app",
  "https://workforce-frontend-git-main-beenish-latifs-projects.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:5000",
];

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: function (origin, callback) {
        if (
          !origin ||
          ALLOWED_ORIGINS.includes(origin) ||
          origin.startsWith("http://127.0.0.1") ||
          origin.startsWith("chrome-extension://")
        ) {
          callback(null, true);
        } else {
          callback(new Error("Socket: Not allowed by CORS — " + origin));
        }
      },
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("⚡ Socket connected:", socket.id);

    // Admin "admins" room join karta hai
    socket.on("join", (roomId) => {
      socket.join(roomId);
      console.log(`📌 ${socket.id} joined: ${roomId}`);
    });

    // App.jsx se "join_room" emit hota hai (role = "admin" | "employee")
    socket.on("join_room", (role) => {
      socket.join(role);
      console.log(`📍 ${socket.id} joined room: ${role}`);
    });

    // Electron agent → admin ko task update forward karo
    socket.on("task:statusUpdate", (payload) => {
      console.log("📡 task:statusUpdate received, forwarding to admins:", payload);
      io.to("admins").emit("task:statusUpdate", payload);
      io.to("admins").emit("task:update", payload);
    });

    // Heartbeat — employee ka live status admin ko bhejo
    socket.on("employee:heartbeat", (data) => {
      io.to("admins").emit("employee:update", {
        employeeId:      data.employeeId,
        status:          data.status || "Active",
        currentApp:      data.activeApp || "",
        currentActivity: data.windowTitle || "",
        activityPct:     data.activityPct || 0,
        lastSeen:        new Date(),
      });
    });

    socket.on("employee:online", (data) => {
      socket.join(data.employeeId);
      io.to("admins").emit("employee:update", {
        employeeId: data.employeeId,
        status:     "Online",
        lastSeen:   new Date(),
      });
    });

    socket.on("employee:offline", (data) => {
      io.to("admins").emit("employee:update", {
        employeeId:      data.employeeId,
        status:          "Offline",
        currentApp:      "",
        currentActivity: "",
        lastSeen:        new Date(),
      });
    });

    socket.on("activity", (data) => {
      io.to("admins").emit("activity-update", data);
    });

    socket.on("disconnect", () => {
      console.log("🔌 Socket disconnected:", socket.id);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized!");
  return io;
};