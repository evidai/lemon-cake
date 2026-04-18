import { registerRoot, Composition } from "remotion";
import { LaunchVideo } from "./LaunchVideo";
import { JpLaunchVideo } from "./JpLaunchVideo";

// Root component — declares every renderable composition
export const RemotionRoot: React.FC = () => (
  <>
    {/* 30-second horizontal cut (X, PH, YouTube, README GIF) — 1920x1080 */}
    <Composition
      id="LaunchVideo"
      component={LaunchVideo}
      durationInFrames={900}   // 30s @ 30fps
      fps={30}
      width={1920}
      height={1080}
    />
    {/* Same content, vertical 9:16 — for Shorts / Reels / TikTok */}
    <Composition
      id="LaunchShorts"
      component={LaunchVideo}
      durationInFrames={900}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ vertical: true }}
    />
    {/* 日本向け 30秒 ― Pay Token → freee → インボイス照合 */}
    <Composition
      id="JpLaunch"
      component={JpLaunchVideo}
      durationInFrames={900}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="JpLaunchShorts"
      component={JpLaunchVideo}
      durationInFrames={900}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ vertical: true }}
    />
  </>
);

registerRoot(RemotionRoot);
