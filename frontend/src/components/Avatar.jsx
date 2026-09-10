import { useState } from "react";
import { UserIcon } from "lucide-react";

const Avatar = ({ src, alt, className = "", size = "md" }) => {
  const [imgError, setImgError] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);

  // Check if URL is from the old broken service
  const isBrokenUrl = src && src.includes("avatar.iran.liara.run");

  // Generate fallback avatar based on initials or use default
  const getInitials = (name) => {
    if (!name) return "?";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name[0].toUpperCase();
  };

  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-16 h-16 text-lg",
    xl: "w-32 h-32 text-2xl",
  };

  const sizeClass = sizeClasses[size] || sizeClasses.md;

  // If no src, error occurred, or broken URL, show fallback
  if (!src || imgError || isBrokenUrl) {
    return (
      <div
        className={`${sizeClass} rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold ${className}`}
      >
        {alt ? getInitials(alt) : <UserIcon className="w-1/2 h-1/2 opacity-50" />}
      </div>
    );
  }

  return (
    <div className={`${sizeClass} rounded-full overflow-hidden ${className}`}>
      {imgLoading && (
        <div className="w-full h-full bg-base-300 animate-pulse flex items-center justify-center">
          <UserIcon className="w-1/2 h-1/2 opacity-30" />
        </div>
      )}
      <img
        src={src}
        alt={alt || "Avatar"}
        className={`w-full h-full object-cover ${imgLoading ? "hidden" : ""}`}
        onError={() => {
          setImgError(true);
          setImgLoading(false);
        }}
        onLoad={() => setImgLoading(false)}
      />
    </div>
  );
};

export default Avatar;
