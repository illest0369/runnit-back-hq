import OperatorApp from "@/components/rbhq/OperatorApp";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublishPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <OperatorApp initialTab="publish" />;
}
