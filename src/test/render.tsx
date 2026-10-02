/**
 * Render helpers for components that need the app's providers.
 *
 * - {@link renderWithRouter}: MemoryRouter + TooltipProvider + Toaster, with a
 *   location probe so tests can assert navigation.
 */
import type { ReactElement } from "react";
import { render, screen, type RenderResult } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location" hidden>
      {location.pathname}
      {location.search}
    </div>
  );
}

/** Options for {@link renderWithRouter}. */
export interface RenderWithRouterOptions {
  /** Initial URL; defaults to `/`. */
  route?: string;
  /** Route pattern the UI is mounted at; defaults to `*` (any URL). */
  path?: string;
}

/** Result of {@link renderWithRouter}. */
export interface RenderWithRouterResult extends RenderResult {
  /** A user-event instance bound to this render. */
  user: UserEvent;
}

/**
 * Render UI inside the providers the app's pages expect.
 *
 * @param ui - Element to render.
 * @param options - Initial route and mount path.
 * @returns The RTL render result plus a `user` for interactions.
 * @example
 * const { user } = renderWithRouter(<Home />);
 * await user.click(screen.getByRole("button", { name: "Fetch" }));
 * expect(currentLocation()).toBe("/downloads");
 */
export function renderWithRouter(
  ui: ReactElement,
  { route = "/", path = "*" }: RenderWithRouterOptions = {}
): RenderWithRouterResult {
  const user = userEvent.setup();
  const result = render(
    <MemoryRouter initialEntries={[route]}>
      <TooltipProvider>
        <Routes>
          <Route path={path} element={ui} />
          {path !== "*" && <Route path="*" element={null} />}
        </Routes>
        <LocationProbe />
        <Toaster />
      </TooltipProvider>
    </MemoryRouter>
  );
  return { ...result, user };
}

/**
 * Current router location rendered by {@link renderWithRouter}.
 *
 * @returns Pathname plus search string, e.g. `/editor?import=v1`.
 */
export function currentLocation(): string {
  return screen.getByTestId("location").textContent ?? "";
}
