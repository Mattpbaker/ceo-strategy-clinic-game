import { FacilitatorDashboard } from "@/components/facilitator-dashboard";

interface Props {
  params: Promise<{ sessionRef: string }>;
}

export default async function FacilitatorPage({ params }: Props): Promise<React.ReactElement> {
  const { sessionRef } = await params;
  return <FacilitatorDashboard sessionRef={sessionRef} />;
}
