import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

type Scene = {
  text: string;
  durationInFrames: number;
};

type EnglishLessonProps = {
  title: string;
  subtitle: string;
  scenes: Scene[];
};

export const EnglishLesson: React.FC<EnglishLessonProps> = ({
  title,
  subtitle,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = Math.min(1, frame / (fps * 0.5));

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#1a1a2e",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <h1
        style={{
          color: "#e94560",
          fontSize: 72,
          fontFamily: "sans-serif",
          textAlign: "center",
          opacity,
          margin: 0,
          padding: "0 40px",
        }}
      >
        {title}
      </h1>
      <p
        style={{
          color: "#ffffff",
          fontSize: 36,
          fontFamily: "sans-serif",
          textAlign: "center",
          opacity,
          margin: 0,
          padding: "0 60px",
        }}
      >
        {subtitle}
      </p>
    </AbsoluteFill>
  );
};
