/** @type {import('next').NextConfig} */
const nextConfig = {
  // 本番: NEXT_PUBLIC_API_URL を空にすると /api/* が Next.js プロキシルートに流れる
  // 開発: .env.local の NEXT_PUBLIC_API_URL=http://localhost:3002 をそのまま使う
};

export default nextConfig;
