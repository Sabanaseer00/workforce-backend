import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      dbName:                   "employeeDB",
      serverSelectionTimeoutMS: 30000,  // 10 → 30 sec
      socketTimeoutMS:          60000,  // 45 → 60 sec
      connectTimeoutMS:         30000,  // ← add karo
      maxPoolSize:              10,     // ← add karo — concurrent queries limit
      minPoolSize:              2,      // ← add karo — min connections ready
      retryWrites:              true,
      retryReads:               true,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // Connection drop hone par auto-reconnect
    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️ MongoDB disconnected — reconnecting...");
      setTimeout(() => connectDB(), 5000);
    });

    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB error:", err.message);
    });

  } catch (error) {
    console.error("❌ DB Error:", error.message);

    if (error.message.includes("ECONNREFUSED"))
      console.log("👉 Fix: Check Internet / VPN / DNS");
    if (error.message.includes("bad auth"))
      console.log("👉 Fix: Username/Password wrong in MONGO_URI");
    if (error.message.includes("ENOTFOUND"))
      console.log("👉 Fix: DNS issue or wrong cluster URL");
    if (error.message.includes("timed out"))
      console.log("👉 Fix: Atlas IP Whitelist mein 0.0.0.0/0 add karo");

    process.exit(1);
  }
};