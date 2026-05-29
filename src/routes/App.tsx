import { useState } from "react";
import { AuthUser, clearStoredUser, getStoredUser } from "@/auth";
import { AppShell } from "@/components/layout/AppShell";
import { AuthScreen } from "./AuthScreen";

export type { AppContext } from "@/components/layout/AppShell";

export function App() {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());

  if (!user) {
    return <AuthScreen onAuthenticated={setUser} />;
  }

  function logout() {
    clearStoredUser();
    setUser(null);
  }

  return <AppShell user={user} onLogout={logout} />;
}
