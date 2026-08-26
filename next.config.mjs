/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // pdf-parse (via pdfjs-dist) breaks when webpack bundles it for the
    // action-browser runtime used by Server Actions invoked from Client
    // Components — keep it as a native Node require instead.
    // dommatrix is external too: webpack's ESM-interop wrapping turns its
    // raw CJS constructor export into a non-callable { default: fn }
    // object, which breaks `new DOMMatrix()` at runtime.
    serverComponentsExternalPackages: ["pdf-parse", "dommatrix"],
  },
};

export default nextConfig;
