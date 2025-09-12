import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import Dashboard from "@/pages/dashboard";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Profile from "@/pages/profile";
import NotFound from "@/pages/not-found";
import Wallet from "@/pages/wallet";
import Transactions from "@/pages/transactions";
import Mining from "@/pages/mining";

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
            <Header />
            <Dashboard />
            <MobileNav />
          </ProtectedRoute>
        )} />

        <Route path="/dashboard" component={() => (
          <ProtectedRoute>
            <Header />
            <Dashboard />
            <MobileNav />
          </ProtectedRoute>
        )} />

        <Route path="/profile" component={() => (
          <ProtectedRoute>
            <Header />
            <Profile />
            <MobileNav />
          </ProtectedRoute>
        )} />

        <Route path="/wallet" component={() => (
          <ProtectedRoute>
            <Header />
            <Wallet />
            <MobileNav />
          </ProtectedRoute>
        )} />

        <Route path="/transactions" component={() => (
          <ProtectedRoute>
            <Header />
            <Transactions />
            <MobileNav />
          </ProtectedRoute>
        )} />

        <Route path="/mining" component={() => (
          <ProtectedRoute>
            <Header />
            <Mining />
            <MobileNav />
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