import { StreamChat } from "stream-chat";
import { getStreamToken } from "./api";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;

let globalClient = null;
let connectionPromise = null;
let currentUserId = null;

export const getStreamClient = async (authUser) => {
  // Return existing client if already connected for this user
  if (globalClient && globalClient.userID === String(authUser?._id)) {
    return globalClient;
  }

  // If connecting for a different user, disconnect first
  if (globalClient && globalClient.userID && globalClient.userID !== String(authUser?._id)) {
    try {
      await globalClient.disconnectUser();
    } catch (error) {
      console.warn("Error disconnecting previous user:", error);
    }
  }

  // If already connecting, wait for that to complete
  if (connectionPromise) {
    await connectionPromise;
    if (globalClient && globalClient.userID === String(authUser?._id)) {
      return globalClient;
    }
  }

  // Connect the client
  connectionPromise = (async () => {
    try {
      globalClient = StreamChat.getInstance(STREAM_API_KEY);
      const userId = String(authUser._id);

      // Get token
      const tokenData = await getStreamToken();
      if (!tokenData?.token) {
        throw new Error("Failed to get token");
      }

      // Sanitize profilePic
      const sanitizedImage = authUser.profilePic && !authUser.profilePic.includes("avatar.iran.liara.run")
        ? authUser.profilePic
        : "";

      // Connect user
      await globalClient.connectUser(
        {
          id: userId,
          name: authUser.fullName,
          image: sanitizedImage,
        },
        tokenData.token
      );

      currentUserId = userId;
      return globalClient;
    } catch (error) {
      console.error("Error connecting Stream client:", error);
      connectionPromise = null;
      throw error;
    }
  })();

  await connectionPromise;
  connectionPromise = null;
  return globalClient;
};

export const getStreamClientInstance = () => {
  return globalClient;
};
