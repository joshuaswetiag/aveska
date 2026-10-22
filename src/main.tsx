import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/app-shell";
import { BootstrapGate } from "@/components/bootstrap-gate";
import { SignOutButton } from "@/components/sign-out-button";
import { PageState, usePageData } from "@/lib/use-page-data.tsx";
import LoginPage from "@/app/login/page";
import DashboardPage from "@/app/(app)/page";
import CustomersPage from "@/app/(app)/customers/page";
import CustomerPage from "@/app/(app)/customers/[id]/page";
import OrdersPage from "@/app/(app)/orders/page";
import ProductsPage from "@/app/(app)/products/page";
import ProductPage from "@/app/(app)/products/[id]/page";
import VehiclesPage from "@/app/(app)/vehicles/page";
import VehiclePage from "@/app/(app)/vehicles/[id]/page";
import AliasesPage from "@/app/(app)/vehicles/aliases/page";
import RecommendationsPage from "@/app/(app)/recommendations/page";
import OpportunitiesPage from "@/app/(app)/opportunities/page";
import CampaignsPage from "@/app/(app)/campaigns/page";
import CampaignPage from "@/app/(app)/campaigns/[id]/page";
import TrafficPage from "@/app/(app)/traffic/page";
import ImportsPage from "@/app/(app)/imports/page";
import ImportPage from "@/app/(app)/imports/[id]/page";
import JobPage from "@/app/(app)/jobs/[id]/page";
import DataQualityPage from "@/app/(app)/data-quality/page";
import SettingsPage from "@/app/(app)/settings/page";
import TemplatesPage from "@/app/(app)/settings/templates/page";
import "./app/globals.css";

type SessionUser = { name?: string | null; email?: string | null; role?: string };

function AuthedLayout() {
  const { data, status } = usePageData<{ user: SessionUser }>("/api/auth/session", { search: false });
  return (
    <PageState status={status} data={data}>
      {(session) => (
        <AppShell user={session.user} signOutSlot={<SignOutButton />}>
          <BootstrapGate>
            <Outlet />
          </BootstrapGate>
        </AppShell>
      )}
    </PageState>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AuthedLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="customers/:id" element={<CustomerPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/:id" element={<ProductPage />} />
          <Route path="vehicles" element={<VehiclesPage />} />
          <Route path="vehicles/aliases" element={<AliasesPage />} />
          <Route path="vehicles/:id" element={<VehiclePage />} />
          <Route path="recommendations" element={<RecommendationsPage />} />
          <Route path="opportunities" element={<OpportunitiesPage />} />
          <Route path="campaigns" element={<CampaignsPage />} />
          <Route path="campaigns/:id" element={<CampaignPage />} />
          <Route path="traffic" element={<TrafficPage />} />
          <Route path="imports" element={<ImportsPage />} />
          <Route path="imports/:id" element={<ImportPage />} />
          <Route path="jobs/:id" element={<JobPage />} />
          <Route path="data-quality" element={<DataQualityPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/templates" element={<TemplatesPage />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  </StrictMode>,
);
