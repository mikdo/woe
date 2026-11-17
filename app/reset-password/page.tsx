"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/hooks";
import { SetPassword } from "@/components/SetPassword";
import { Logo } from "@/components/Logo";
import { Cheko, Otto } from "@/components/Characters";
import { SkyPage } from "@/components/SkyPage";

/** Landing page for the "reset your password" email link. */
export default function ResetPassword() {
  const { session, loading } = useSession();
  const router = useRouter();
  if (loading) return <main className="min-h-dvh bg-sky-wash" />;
  return (
    <SkyPage
      hero={
        <div className="flex flex-col items-center gap-4 pb-2 pt-6">
          <div className="flex items-end gap-2">
            <Otto size={72} />
            <div className="bob"><Cheko size={56} /></div>
          </div>
          <Logo size={52} />
        </div>
      }
    >
      {session ? (
        <SetPassword title="Choose a new password" onDone={() => setTimeout(() => router.replace("/"), 1200)} />
      ) : (
        <div className="card space-y-4 text-center">
          <p className="text-lg">That link has expired. Ask for a new one from the sign-in screen.</p>
          <Link href="/" className="btn-primary">Back to sign in</Link>
        </div>
      )}
    </SkyPage>
  );
}
