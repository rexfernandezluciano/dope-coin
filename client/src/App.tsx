import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient.js";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster.js";
import { TooltipProvider } from "@/components/ui/tooltip.js";
import { AuthProvider, useAuth } from "@/hooks/use-auth.js";
import { Header } from "@/components/header.js";
import { MobileNav } from "@/components/mobile-nav.js";
import Dashboard from "@/pages/dashboard.js";
import Login from "@/pages/login.js";
import Register from "@/pages/register.js";
import Profile from "@/pages/profile.js";
import NotFound from "@/pages/not-found.js";
import Wallet from "@/pages/wallet.js";
import Transactions from "@/pages/transactions.js";
import Mining from "@/pages/mining.js";
import ReferralsPage from "@/pages/referrals.js";
import SendPage from "@/pages/send.js";
import ReceivePage from "@/pages/receive.js";
import TradingPage from "@/pages/trading.js";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return <Dashboard />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <div className="min-h-screen bg-background">
      <Switch>
        <Route path="/" component={() => (
          <ProtectedRoute>
            <div className="flex flex-col min-h-screen">
              <Header />
              <main className="flex-1 main-content">
                <Dashboard />
              </main>
              <MobileNav />
            </div>
          </ProtectedRoute>
        )} />

        <Route path="/dashboard" component={() => (
          <ProtectedRoute>
            <div className="flex flex-col min-h-screen">
              <Header />
              <main className="flex-1 main-content">
                <Dashboard />
              </main>
              <MobileNav />
            </div>
          </ProtectedRoute>
        )} />

        <Route path="/profile" component={() => (
          <ProtectedRoute>
            <div className="flex flex-col min-h-screen">
              <Header />
              <main className="flex-1 main-content">
                <Profile />
              </main>
              <MobileNav />
            </div>
          </ProtectedRoute>
        )} />

        <Route path="/wallet" component={() => (
          <ProtectedRoute>
            <div className="flex flex-col min-h-screen">
              <Header />
              <main className="flex-1 main-content">
                <Wallet />
              </main>
              <MobileNav />
            </div>
          </ProtectedRoute>
        )} />

        <Route path="/transactions" component={() => (
          <ProtectedRoute>
            <div className="flex flex-col min-h-screen">
              <Header />
              <main className="flex-1 main-content">
                <Transactions />
              </main>
              <MobileNav />
            </div>
          </ProtectedRoute>
        )} />

        <Route path="/mining" component={() => (
          <ProtectedRoute>
            <div className="flex flex-col min-h-screen">
              <Header />
              <main className="flex-1 main-content">
                <Mining />
              </main>
              <MobileNav />
            </div>
          </ProtectedRoute>
        )} />

        <Route path="/referrals" component={() => (
          <ProtectedRoute>
            <div className="flex flex-col min-h-screen">
              <Header />
              <main className="flex-1 main-content">
                <ReferralsPage />
              </main>
              <MobileNav />
            </div>
          </ProtectedRoute>
        )} />

        <Route path="/send" component={() => (
          <ProtectedRoute>
            <div className="flex flex-col min-h-screen">
              <Header />
              <main className="flex-1 main-content">
                <SendPage />
              </main>
              <MobileNav />
            </div>
          </ProtectedRoute>
        )} />

        <Route path="/receive" component={() => (
          <ProtectedRoute>
            <div className="flex flex-col min-h-screen">
              <Header />
              <main className="flex-1 main-content">
                <ReceivePage />
              </main>
              <MobileNav />
            </div>
          </ProtectedRoute>
        )} />

        <Route path="/trading" component={() => (
          <ProtectedRoute>
            <div className="flex flex-col min-h-screen">
              <Header />
              <main className="flex-1 main-content">
                <TradingPage />
              </main>
              <MobileNav />
            </div>
          </ProtectedRoute>
        )} />

        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;