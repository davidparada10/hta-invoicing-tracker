/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse (via pdfjs-dist) breaks when the bundler processes it for the
  // action-browser runtime used by Server Actions invoked from Client
  // Components — keep it as a native Node require instead.
  // dommatrix is external too: ESM-interop wrapping turns its raw CJS
  // constructor export into a non-callable { default: fn } object, which
  // breaks `new DOMMatrix()` at runtime.
  serverExternalPackages: ["pdf-parse", "dommatrix"],
  // pdf-parse dynamically imports its worker script by path at runtime
  // (`pdf.worker.mjs`, used as pdfjs's same-thread fallback when no real
  // worker thread starts). Being a dynamic, computed-path import, Next's
  // file tracer never sees it and drops it from the deployment bundle —
  // include it explicitly so it exists alongside the CJS entry it ships next to.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/pdf-parse/dist/pdf-parse/cjs/pdf.worker.mjs"],
  },
};

export default nextConfig;
