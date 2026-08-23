"use client";

import { usePathname } from "next/navigation";
import { AuthProvider, useAuth } from "@/components/auth/auth-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { RealtimeToasts } from "@/components/realtime/realtime-toasts";
import { CloseoutAssistant } from "@/components/closeout/closeout-assistant";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { MobileHeader } from "./mobile-header";
import { MobileDock } from "./mobile-dock";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppShellInner>{children}</AppShellInner>
      </AuthProvider>
    </ThemeProvider>
  );
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me, loading } = useAuth();
  const isLogin = pathname === "/login";
  const isWideContent = pathname.startsWith("/maringo");
  const isLimitedUser = !loading && me != null && !me.isAdmin;

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-dvh bg-background lg:flex">
      <div className="sticky top-0 z-20 hidden h-dvh shrink-0 lg:block">
        <Sidebar />
      </div>
      <main className="relative min-h-dvh min-w-0 flex-1 lg:h-dvh lg:overflow-y-auto">
        <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
          <MobileHeader />
          {me ? <RealtimeToasts /> : null}
          {me ? <ServiceWorkerRegister /> : null}
          {me ? <CloseoutAssistant /> : null}
          <div
            className={`mx-auto w-full min-w-0 px-4 py-5 pb-[max(6.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-7 lg:px-8 lg:py-8 lg:pb-8 ${
              isWideContent ? "max-w-[96rem]" : "max-w-7xl"
            }`}
          >
            {children}
          </div>
          {me || !isLimitedUser ? <MobileDock /> : <MobileDock />}
        </div>
      </main>
    </div>
  );
}
