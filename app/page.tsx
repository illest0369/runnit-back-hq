import OperatorApp from "@/components/rbhq/OperatorApp";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function HomePage() {
  return <OperatorApp initialTab="queue" />;
}
