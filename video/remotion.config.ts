import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setConcurrency(8);
// Higher quality for social posting
Config.setPixelFormat("yuv420p");
Config.setCodec("h264");
Config.setCrf(18);
