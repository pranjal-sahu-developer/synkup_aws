import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { useQuery } from "@tanstack/react-query";
import { getStreamToken } from "../lib/api";

import {
  Channel,
  ChannelHeader,
  Chat,
  MessageInput,
  MessageList,
  Thread,
  Window,
} from "stream-chat-react";
import { StreamChat } from "stream-chat";
import toast from "react-hot-toast";

import ChatLoader from "../components/ChatLoader";
import CallButton from "../components/CallButton";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;

const ChatPage = () => {
  const { id: targetUserId } = useParams();

  const [chatClient, setChatClient] = useState(null);
  const [channel, setChannel] = useState(null);
  const [loading, setLoading] = useState(true);
  const initRef = useRef(false); // Prevent double initialization
  const connectingRef = useRef(false); // Track if connection is in progress

  const { authUser, isLoading: authUserLoading } = useAuthUser();

  const { data: tokenData, isLoading: tokenLoading } = useQuery({
    queryKey: ["streamToken", authUser?._id], // Include user ID in query key to ensure fresh token
    queryFn: getStreamToken,
    enabled: !!authUser && !authUserLoading, // Wait for authUser to be ready
    staleTime: 0, // Always fetch fresh token
    cacheTime: 0, // Don't cache token
  });

  useEffect(() => {
    // Wait for both authUser and token to be ready
    if (authUserLoading || tokenLoading) {
      return;
    }

    if (!authUser || !tokenData?.token) {
      setLoading(false);
      return;
    }

    // Prevent double initialization
    if (initRef.current || connectingRef.current) {
      return;
    }

    initRef.current = true;
    connectingRef.current = true;
    let isMounted = true;
    let client = null;

    const initChat = async () => {
      try {
        console.log("Initializing stream chat client...");

        client = StreamChat.getInstance(STREAM_API_KEY);

        // Ensure user ID is a string to match token - use exact same format as backend
        const userId = String(authUser._id);
        
        // Verify token was generated for this user
        if (tokenData.userId && tokenData.userId !== userId) {
          console.error("Token user ID mismatch!", {
            tokenUserId: tokenData.userId,
            authUserId: userId
          });
          throw new Error("Token user ID does not match current user");
        }

        console.log("Connecting with user ID:", userId);
        console.log("Token available:", !!tokenData.token);

        // Check if already connected to the same user
        if (client.userID === userId && client.user) {
          console.log("Already connected, setting up channel...");
          // Already connected to the same user, just set up channel
          const channelId = [userId, targetUserId].sort().join("-");
          const currChannel = client.channel("messaging", channelId, {
            members: [userId, targetUserId],
          });

          await currChannel.watch();

          if (isMounted) {
            setChatClient(client);
            setChannel(currChannel);
            setLoading(false);
            connectingRef.current = false;
          }
          return;
        }

        // Disconnect if connected to a different user or if already connected
        if (client.userID) {
          try {
            console.log("Disconnecting previous connection for user:", client.userID);
            await client.disconnectUser();
            // Wait for disconnect to complete
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (disconnectError) {
            console.warn("Error disconnecting:", disconnectError);
          }
        }

        // Sanitize profilePic - don't pass broken URLs to Stream Chat
        const sanitizedImage = authUser.profilePic && !authUser.profilePic.includes("avatar.iran.liara.run")
          ? authUser.profilePic
          : "";

        console.log("Connecting user:", userId, "with token");
        await client.connectUser(
          {
            id: userId,
            name: authUser.fullName,
            image: sanitizedImage,
          },
          tokenData.token
        );

        if (!isMounted) {
          await client.disconnectUser();
          connectingRef.current = false;
          return;
        }

        const channelId = [userId, targetUserId].sort().join("-");

        const currChannel = client.channel("messaging", channelId, {
          members: [userId, targetUserId],
        });

        await currChannel.watch();

        if (isMounted) {
          setChatClient(client);
          setChannel(currChannel);
          setLoading(false);
          connectingRef.current = false;
        }
      } catch (error) {
        console.error("Error initializing chat:", error);
        connectingRef.current = false;
        initRef.current = false; // Reset on error to allow retry
        if (isMounted) {
          toast.error("Could not connect to chat. Please try again.");
          setLoading(false);
        }
      }
    };

    initChat();

    // Cleanup function
    return () => {
      isMounted = false;
      // Don't reset refs here - let them reset on error or successful connection
    };
  }, [tokenData, authUser, targetUserId, authUserLoading, tokenLoading]);

  const handleVideoCall = () => {
    if (channel) {
      const callUrl = `${window.location.origin}/call/${channel.id}`;

      channel.sendMessage({
        text: `I've started a video call. Join me here: ${callUrl}`,
      });

      toast.success("Video call link sent successfully!");
    }
  };

  if (loading || !chatClient || !channel) return <ChatLoader />;

  return (
    <div className="h-[93vh]">
      <Chat client={chatClient}>
        <Channel channel={channel}>
          <div className="w-full relative">
            <CallButton handleVideoCall={handleVideoCall} />
            <Window>
              <ChannelHeader />
              <MessageList />
              <MessageInput focus />
            </Window>
          </div>
          <Thread />
        </Channel>
      </Chat>
    </div>
  );
};
export default ChatPage;