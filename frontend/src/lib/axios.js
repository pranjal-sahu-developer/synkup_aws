import axios from "axios";

// Use environment variable or fallback to production URL
const BASE_URL = import.meta.env.VITE_API_URL || "/api";

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // send cookies with the request
});

export default axiosInstance;