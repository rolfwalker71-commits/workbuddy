import { PresenceTeamBoard } from "@/components/presence/presence-team-board";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Team",
};

export default function TeamPage() {
  return <PresenceTeamBoard />;
}
