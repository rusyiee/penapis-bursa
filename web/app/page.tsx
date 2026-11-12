import { Suspense } from "react";
import { redirect } from "next/navigation";
import Screener from "@/components/Screener";
import { createClient } from "@/lib/supabase/server";

// Sesi dibaca semasa permintaan, jadi bahagian ini distrim di belakang <Suspense>.
async function SignedIn() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return <Screener email={data.user.email ?? ""} />;
}

export default function Home() {
  return (
    <Suspense fallback={<p className="wrap" style={{ padding: "24px 16px" }}>Memuatkan…</p>}>
      <SignedIn />
    </Suspense>
  );
}
