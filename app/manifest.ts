import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "مِرْقَاةُ الْبَيَانِ",
    short_name: "مِرْقَاة",
    description: "Learner-led literary Arabic speaking coach",
    start_url: "/",
    display: "standalone",
    background_color: "#071526",
    theme_color: "#071526",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
