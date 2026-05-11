import { notFound } from "next/navigation";
import { ModerationPlayer } from "@/src/components/ModerationPlayer";
import { getClipById } from "@/src/lib/mockData";

type Props = {
  params: {
    clipId: string;
  };
};

export function generateStaticParams() {
  return [];
}

export default function ClipPage({ params }: Props) {
  const clip = getClipById(params.clipId);
  if (!clip) notFound();

  return <ModerationPlayer clip={clip} />;
}
