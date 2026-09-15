import type { NextConfig } from 'next';
const config: NextConfig = { serverExternalPackages: ['ffmpeg-static', 'ffprobe-static'] };
export default config;
