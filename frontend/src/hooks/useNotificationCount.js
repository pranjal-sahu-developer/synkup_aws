import { useQuery } from "@tanstack/react-query";
import { getFriendRequests, getStreamToken } from "../lib/api";
import { useEffect, useState } from "react";
import useAuthUser from "./useAuthUser";
import { StreamChat } from "stream-chat";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;

const useNotificationCount = () => {
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [unreadChannels, setUnreadChannels] = useState([]);
  const { authUser } = useAuthUser();

  // Get friend requests count
  const { data: friendRequests } = useQuery({
    queryKey: ["friendRequests"],
    queryFn: getFriendRequests,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const incomingRequestsCount = friendRequests?.incomingReqs?.length || 0;

  // Track unread messages from Stream Chat
  useEffect(() => {
    if (!authUser) {
      setUnreadMessageCount(0);
      setUnreadChannels([]);
      return;
    }

    let isMounted = true;
    const client = StreamChat.getInstance(STREAM_API_KEY);
    const userId = String(authUser._id);

    // Get initial unread count and channels
    const updateUnreadData = async () => {
      try {
        // Check if client is connected for this user
        if (!client.userID || client.userID !== userId) {
          // Try to connect if not connected
          try {
            const tokenData = await getStreamToken();
            if (!tokenData?.token) {
              if (isMounted) {
                setUnreadMessageCount(0);
                setUnreadChannels([]);
              }
              return;
            }

            const sanitizedImage = authUser.profilePic && !authUser.profilePic.includes("avatar.iran.liara.run")
              ? authUser.profilePic
              : "";

            await client.connectUser(
              {
                id: userId,
                name: authUser.fullName,
                image: sanitizedImage,
              },
              tokenData.token
            );
          } catch (connectError) {
            // If connection fails, just return - client might be connecting elsewhere
            if (isMounted) {
              setUnreadMessageCount(0);
              setUnreadChannels([]);
            }
            return;
          }
        }

        if (!client.userID || client.userID !== userId || !isMounted) {
          return;
        }

        // Query channels with unread messages - need to watch to get unread counts
        const filter = { type: "messaging", members: { $in: [userId] } };
        const sort = { last_message_at: -1 };
        const channels = await client.queryChannels(filter, sort, {
          watch: true,
          state: true,
        });

        let totalUnread = 0;
        const channelsWithUnread = [];

        // Also check active channels (already watched)
        const allChannels = [...channels];
        client.activeChannels.forEach((channel) => {
          if (!allChannels.find(c => c.id === channel.id)) {
            allChannels.push(channel);
          }
        });

        allChannels.forEach((channel) => {
          try {
            // Try multiple methods to get unread count
            let unread = 0;
            
            // Method 1: Use state.unreadCount (most reliable)
            if (channel.state?.unreadCount !== undefined) {
              unread = channel.state.unreadCount;
            }
            // Method 2: Use countUnread() method
            else if (typeof channel.countUnread === 'function') {
              unread = channel.countUnread();
            }
            // Method 3: Calculate from read state
            else if (channel.state?.read) {
              const readState = channel.state.read[userId];
              if (readState && channel.state.messages) {
                const lastReadMessageId = readState.last_read_message_id;
                const messages = channel.state.messages;
                const lastReadIndex = messages.findIndex(m => m.id === lastReadMessageId);
                unread = lastReadIndex >= 0 ? messages.length - lastReadIndex - 1 : messages.length;
              }
            }
            
            if (unread > 0) {
              totalUnread += unread;
              // Get the other member's ID (not the current user)
              const members = Object.values(channel.state?.members || {});
              const otherMember = members.find(m => m.user?.id !== userId);
              
              if (otherMember?.user) {
                const messages = channel.state?.messages || [];
                const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
                
                channelsWithUnread.push({
                  channelId: channel.id,
                  userId: otherMember.user.id,
                  userName: otherMember.user.name || "Unknown",
                  userImage: otherMember.user.image || "",
                  unreadCount: unread,
                  lastMessage: lastMessage,
                });
              }
            }
          } catch (channelError) {
            // Skip channels with errors
            console.warn("Error processing channel:", channelError);
          }
        });

        console.log("Unread messages found:", totalUnread, "channels:", channelsWithUnread.length);

        if (isMounted) {
          setUnreadMessageCount(totalUnread);
          setUnreadChannels(channelsWithUnread);
        }
      } catch (error) {
        console.error("Error fetching unread messages:", error);
        if (isMounted) {
          setUnreadMessageCount(0);
          setUnreadChannels([]);
        }
      }
    };

    // Initial update with delay to allow client to connect
    const timeoutId = setTimeout(() => {
      updateUnreadData();
    }, 2000); // Increased delay to ensure connection is ready

    // Listen for unread changes
    const handleEvent = (event) => {
      console.log("Stream event received:", event.type);
      updateUnreadData();
    };

    const handleConnectionChange = (event) => {
      console.log("Connection changed:", event.online);
      if (event.online && client.userID === userId) {
        updateUnreadData();
      }
    };

    const handleMessageNew = (event) => {
      console.log("New message event:", event);
      updateUnreadData();
    };

    // Listen to multiple events for better coverage
    client.on("notification.message_new", handleEvent);
    client.on("notification.mark_read", handleEvent);
    client.on("message.new", handleMessageNew);
    client.on("message.read", handleEvent);
    client.on("connection.changed", handleConnectionChange);

    // Poll for updates more frequently
    const interval = setInterval(() => {
      if (client.userID === userId && isMounted) {
        updateUnreadData();
      }
    }, 10000); // Check every 10 seconds for better responsiveness

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      clearInterval(interval);
      client.off("notification.message_new", handleEvent);
      client.off("notification.mark_read", handleEvent);
      client.off("message.new", handleMessageNew);
      client.off("message.read", handleEvent);
      client.off("connection.changed", handleConnectionChange);
    };
  }, [authUser]);

  const totalCount = incomingRequestsCount + unreadMessageCount;

  return {
    friendRequestsCount: incomingRequestsCount,
    unreadMessageCount,
    unreadChannels,
    totalCount,
  };
};

export default useNotificationCount;
