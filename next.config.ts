import type { NextConfig } from "next";

const customDomain = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? "av-observatory.com";
const useLegacyProjectPath =
  process.env.GITHUB_ACTIONS === "true" &&
  process.env.NEXT_PUBLIC_USE_GITHUB_PROJECT_PATH === "true";
const basePath = useLegacyProjectPath ? "/av-observatory-web" : "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_SITE_DOMAIN: customDomain,
  },
};

export default nextConfig;
