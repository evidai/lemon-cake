import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setConcurrency(8);
// Defaults for MP4 renders; GIF renders override via CLI flags.
Config.setPixelFormat("yuv420p");
