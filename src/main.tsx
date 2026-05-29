import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { App } from "./routes/App";
import { Dashboard } from "./routes/Dashboard";
import { Accounts } from "./routes/Accounts";
import { Cards } from "./routes/Cards";
import { Categories } from "./routes/Categories";
import { Entry } from "./routes/Entry";
import { TransactionTypes } from "./routes/TransactionTypes";
import { TransactionTypeView } from "./routes/TransactionTypeView";
import { CategoryView } from "./routes/CategoryView";
import { SharedCard } from "./routes/SharedCard";
import { Investments } from "./routes/Investments";
import { OtherAssets } from "./routes/OtherAssets";
import { Subscriptions } from "./routes/Subscriptions";
import { Signup } from "./routes/Signup";
import "./index.css";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "entry", element: <Entry /> },
      { path: "transaction-types", element: <TransactionTypes /> },
      { path: "by-type", element: <TransactionTypeView /> },
      { path: "by-category", element: <CategoryView /> },
      { path: "cards", element: <Cards /> },
      { path: "shared-card", element: <SharedCard /> },
      { path: "accounts", element: <Accounts /> },
      { path: "categories", element: <Categories /> },
      { path: "other-assets", element: <OtherAssets /> },
      { path: "investments", element: <Investments /> },
      { path: "subscriptions", element: <Subscriptions /> },
      { path: "signup", element: <Signup /> }
    ]
  }
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
