import { Server } from "socket.io";

let io;

<<<<<<< HEAD
export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST", "PATCH", "PUT", "DELETE"] },
=======
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
>>>>>>> 9946b18a919f250714a3bb09d2c48c1e7e27f31f
  });

  io.on("connection", (socket) => {
    console.log("⚡ Socket connected:", socket.id);

    // Admin "admins" room join karta hai
    socket.on("join", (roomId) => {
      socket.join(roomId);
      console.log(`📌 ${socket.id} joined: ${roomId}`);
    });

<<<<<<< HEAD
    // ✅ FIX — App.jsx se "join_room" emit hota hai, yahan handle karo
    // BlockedAppProvider mein: socket.emit("join_room", role || "employee")
=======
    // App.jsx se "join_room" emit hota hai (role = "admin" | "employee")
>>>>>>> 9946b18a919f250714a3bb09d2c48c1e7e27f31f
    socket.on("join_room", (role) => {
      socket.join(role);
      console.log(`🔐 Socket joined role room: ${role}`);
    });

<<<<<<< HEAD
    // Employee apne room mein join hota hai
=======
    // Employee apne room mein join hota hai (JWT se empId nikalta hai)
>>>>>>> 9946b18a919f250714a3bb09d2c48c1e7e27f31f
    socket.on("join_employee", () => {
      const token = socket.handshake.auth?.token;
      if (token) {
        try {
          const payload = JSON.parse(
            Buffer.from(token.split(".")[1], "base64").toString()
          );
          const empId = payload.id || payload._id || payload.userId;
          if (empId) {
            socket.join(`emp_${empId}`);
            console.log(`👤 Employee ${empId} joined room`);
          }
<<<<<<< HEAD
        } catch {}
=======
        } catch {
          console.warn("⚠️ join_employee: invalid token");
        }
>>>>>>> 9946b18a919f250714a3bb09d2c48c1e7e27f31f
      }
    });

    // Electron agent → admin ko task update forward karo
    socket.on("task:statusUpdate", (payload) => {
      console.log("📡 task:statusUpdate received, forwarding to admins:", payload);
      io.to("admins").emit("task:statusUpdate", payload);
      io.to("admins").emit("task:update", payload);
    });

<<<<<<< HEAD
    // Heartbeat
=======
    // Heartbeat — employee ka live status admin ko bhejo
>>>>>>> 9946b18a919f250714a3bb09d2c48c1e7e27f31f
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
      console.log("❌ Socket disconnected:", socket.id);
    });
  });

  return io;
};

export const getIO = () => io;