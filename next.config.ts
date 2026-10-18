import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{source:"/:path*",headers:[
      {key:"Referrer-Policy",value:"no-referrer"},
      {key:"X-Content-Type-Options",value:"nosniff"},
      {key:"Content-Security-Policy",value:"object-src 'none'; base-uri 'self'; form-action 'self'; connect-src 'self'"},
      {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"},
    ]}];
  },
};

export default nextConfig;
