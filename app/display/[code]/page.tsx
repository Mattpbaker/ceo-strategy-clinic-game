import { WarRoomDisplay } from "@/components/war-room-display";

interface Props {
  params: Promise<{ code: string }>;
}

export default async function DisplayPage({ params }: Props): Promise<React.ReactElement> {
  const { code } = await params;
  return <WarRoomDisplay sessionCode={code.toUpperCase()} />;
}
