import { generateStreamToken } from "../lib/stream.js";

export async function getStreamToken(req, res) {
  try {
    // Ensure we use the string representation of the user ID
    const userId = req.user._id.toString();
    console.log("Generating token for user ID:", userId);
    const token = generateStreamToken(userId);

    if (!token) {
      console.error("Token generation returned null/undefined");
      return res.status(500).json({ message: "Failed to generate token" });
    }

    console.log("Token generated successfully for user:", userId);
    res.status(200).json({ token, userId }); // Also return userId for verification
  } catch (error) {
    console.log("Error in getStreamToken controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}