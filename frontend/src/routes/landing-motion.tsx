import { createFileRoute } from "@tanstack/react-router";
import { LandingMotion } from "@/components/landing-motion/landing-motion";

export const Route = createFileRoute("/landing-motion")({
  head: () => ({
    meta: [
      { title: "IslandQuiz — motion experiment" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: LandingMotion,
});
