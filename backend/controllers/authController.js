import { User } from "../models/userModel.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { upsertStreamUser } from "../lib/stream.js";

// Helper function to sanitize profilePic URLs - remove broken avatar service URLs
const sanitizeProfilePic = (profilePic) => {
    if (!profilePic) return "";
    // Don't pass broken avatar service URLs to Stream
    if (profilePic.includes("avatar.iran.liara.run")) {
        return "";
    }
    return profilePic;
};

export const signup = async (req, res) => {
    try {
        const { email, password, fullName } = req.body;
        if (!email || !password || !fullName) {
            return res.status(400).json({
                message: "All fileds are required"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                message: "Password must be of 6 characters"
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(email)) {
            return res.status(400).json({
                message: "Invalid email format"
            });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                message: "User exists already"
            });
        }

        const idx = Math.floor(Math.random() * 100) + 1;
        const randomAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${idx}`;

        const newUser = await User.create({
            email,
            fullName,
            password,
            profilePic: randomAvatar,
        })


        try {
            await upsertStreamUser({
                id: newUser._id.toString(),
                name: newUser.fullName,
                image: sanitizeProfilePic(newUser.profilePic),
            });
            console.log(`Stream user created for ${newUser.fullName}`);
        } catch (error) {
            console.log("Error creating Stream user:", error);
        }

        const token = jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET_KEY, {
            expiresIn: "7d"
        })

        res.cookie("jwt", token, {
            maxAge: 7 * 24 * 60 * 60 * 1000,
            httpOnly: true, // prevent XSS attacks
            sameSite: req.secure ? "none" : "lax",
            secure: req.secure,
        });

        res.status(201).json({
            success: true,
            user: newUser
        })
    } catch (error) {
        console.log("Error in signup controller", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                message: "All fields are required"
            })
        }

        let user = await User.findOne({ email })

        if (!user) {
            return res.status(400).json({
                message: "User does not exists"
            })
        }

        let isMatched = await bcrypt.compare(password, user.password);

        if (!isMatched) {
            return res.status(400).json({
                message: "Incorrect password"
            })
        }


        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET_KEY, {
            expiresIn: "7d"
        })

        res.cookie("jwt", token, {
            maxAge: 7 * 24 * 60 * 60 * 1000,
            httpOnly: true, // prevent XSS attacks
            sameSite: req.secure ? "none" : "lax",
            secure: req.secure,
        });

        res.status(201).json({
            success: true,
            message: "Login successfull",
            user: user
        })
    } catch (error) {
        console.log("Error in login controller", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}
export const logout = async(req, res)=> {
  res.clearCookie("jwt", {
    httpOnly: true,
        sameSite: req.secure ? "none" : "lax",
        secure: req.secure,
  });
  res.status(200).json({ success: true, message: "Logout successful" });
}


export const onboard = async (req, res) => {
    try {
        const userId = req.user._id;

        const { fullName, bio, nativeLanguage, learningLanguage, location } = req.body;

        if (!fullName || !bio || !nativeLanguage || !learningLanguage || !location) {
            return res.status(400).json({
                message: "All fields are required",
                missingFields: [
                    !fullName && "fullName",
                    !bio && "bio",
                    !nativeLanguage && "nativeLanguage",
                    !learningLanguage && "learningLanguage",
                    !location && "location",
                ].filter(Boolean),
            });
        }
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                ...req.body,
                isOnboarded: true,
            },
            { new: true }
        );

        if (!updatedUser) return res.status(404).json({ message: "User not found" });

        try {
            await upsertStreamUser({
                id: updatedUser._id.toString(),
                name: updatedUser.fullName,
                image: sanitizeProfilePic(updatedUser.profilePic),
            });
            console.log(`Stream user updated after onboarding for ${updatedUser.fullName}`);
        } catch (streamError) {
            console.log("Error updating Stream user during onboarding:", streamError.message);
        }

        res.status(200).json({ success: true, user: updatedUser });
    } catch (error) {
        console.error("Onboarding error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}