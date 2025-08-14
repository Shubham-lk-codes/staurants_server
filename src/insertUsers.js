// import mongoose from "mongoose";
// import bcrypt from "bcrypt";
// import { User } from "./models.js"; 
// async function connectDB() {
//   try {
//     await mongoose.connect(
//       "mongodb+srv://shubhamlonkar137:Uu7tA4lA44RAhcJJ@cluster0.4usdxpx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
//       {
//         useNewUrlParser: true,
//         useUnifiedTopology: true,
//       }
//     );
//     console.log("✅ MongoDB Connected");
//   } catch (error) {
//     console.error("❌ MongoDB Connection Error:", error);
//     process.exit(1);
//   }
// }

// async function insertUsers() {
//   try {
//     const usersData = [
//       { email: "admin@restaurant.com", password: "admin123", role: "admin" },
//       { email: "staff1@restaurant.com", password: "staff123", role: "staff" },
//       { email: "staff2@restaurant.com", password: "staff456", role: "staff" }
//     ];

//     // Password hash करके insert करना
//     const hashedUsers = await Promise.all(
//       usersData.map(async (user) => ({
//         email: user.email,
//         passwordHash: await bcrypt.hash(user.password, 10),
//         role: user.role
//       }))
//     );

//     await User.insertMany(hashedUsers);
//     console.log("✅ Users inserted successfully!");
//   } catch (error) {
//     console.error("❌ Error inserting users:", error);
//   } finally {
//     mongoose.connection.close();
//   }
// }

// await connectDB();
// await insertUsers();

import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { User } from "./models.js";

async function connectDB() {
  try {
    await mongoose.connect(
      "mongodb+srv://shubhamlonkar137:Uu7tA4lA44RAhcJJ@cluster0.4usdxpx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    );
    console.log("✅ MongoDB Connected");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    process.exit(1);
  }
}

async function insertUsers() {
  try {
    const usersData = [
      { email: "admin@restaurant.com", password: "admin123", role: "admin" },
      { email: "staff1@restaurant.com", password: "staff123", role: "staff" },
      { email: "staff2@restaurant.com", password: "staff456", role: "staff" }
    ];

    const hashedUsers = await Promise.all(
      usersData.map(async (user) => ({
        email: user.email,
        passwordHash: await bcrypt.hash(user.password, 10),
        role: user.role
      }))
    );

    await User.insertMany(hashedUsers);
    console.log("✅ Users inserted successfully!");
  } catch (error) {
    console.error("❌ Error inserting users:", error);
  } finally {
    mongoose.connection.close();
  }
}

await connectDB();
await insertUsers();
