import { PlayerDashboard } from "@/components/player-dashboard";

interface Props {
  params: Promise<{ sessionRef: string }>;
}

export default async function SessionPage({ params }: Props): Promise<React.ReactElement> {
  const { sessionRef } = await params;
  return <PlayerDashboard sessionRef={sessionRef} />;
}
