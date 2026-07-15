import { TutorShell } from "@/components/tutor-shell";
import { getBootstrapData } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function Home() {
  return <TutorShell initialData={getBootstrapData()} />;
}
