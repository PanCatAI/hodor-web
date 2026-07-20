import { useState } from "react";
import { RouterProvider } from "@tanstack/react-router";

import { createHodorRouter } from "./router";

export function HodorApp() {
  const [router] = useState(createHodorRouter);

  return <RouterProvider router={router} />;
}
