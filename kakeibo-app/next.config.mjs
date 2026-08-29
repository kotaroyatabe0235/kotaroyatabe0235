/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow phones/other devices on the LAN to reach the dev server (npm run dev).
  // Not needed for production (npm run start).
  allowedDevOrigins: ["192.168.0.3"],
};

export default nextConfig;
