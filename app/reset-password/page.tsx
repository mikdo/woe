"use client";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/hooks";
import { SetPassword } from "@/components/SetPassword";
import { Logo } from "@/components/Logo";

/** Landing page for the "reset your password" email link. */
export default function ResetPassword() {
  const { session, loading } = useSession();
  const router = useRouter();
  if (loading) return null;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6">
      <Logo size={64} />
      {session ? (
        <div className="w-full">
          <SetPassword title="Choose a new password" onDone={() => setTimeout(() => router.replace("/"), 1200)} />
        </div>
      ) : (
        <p className="card text-center text-lg">That link has expired. Ask for a new one from the sign-in screen.</p>
      )}
    </main>
  );
}
