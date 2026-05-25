import { Server } from "socket.io";

let io;

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST", "PATCH", "PUT", "DELETE"] },
  });

  io.on("connection", (socket) => {
    console.log("⚡ Socket connected:", socket.id);

    // Admin "admins" room join karta hai
    socket.on("join", (roomId) => {
      socket.join(roomId);
      console.log(`📌 ${socket.id} joined: ${roomId}`);
    });

    // ✅ FIX — App.jsx se "join_room" emit hota hai, yahan handle karo
    // BlockedAppProvider mein: socket.emit("join_room", role || "employee")
    socket.on("join_room", (role) => {
      socket.join(role);
      console.log(`🔐 Socket joined role room: ${role}`);
    });

    // Employee apne room mein join hota hai
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
        } catch {}
      }
    });

    // Electron agent → admin ko task update forward karo
    socket.on("task:statusUpdate", (payload) => {
      console.log("📡 task:statusUpdate received, forwarding to admins:", payload);
      io.to("admins").emit("task:statusUpdate", payload);
      io.to("admins").emit("task:update", payload);
    });

    // Heartbeat
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