import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_ACTIONS === "true";
const basePath = isGitHubPages ? "/av-observatory-web" : "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
