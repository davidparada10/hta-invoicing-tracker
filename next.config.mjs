/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // pdf-parse (via pdfjs-dist) breaks when webpack bundles it for the
    // action-browser runtime used by Server Actions invoked from Client
    // Components — keep it as a native Node require instead.
    serverComponentsExternalPackages: ["pdf-parse"],
  },
};

export default nextConfig;
