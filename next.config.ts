import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg mixes each episode into one audio file on the server.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/episodes/*/play": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/admin/*": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/admin/style-test": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/internal/*": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
