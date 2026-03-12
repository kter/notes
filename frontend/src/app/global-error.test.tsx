import * as Sentry from "@sentry/nextjs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      effect();
    },
  };
});

vi.mock("next/error", () => ({
  default: ({ statusCode }: { statusCode: number }) => <div>next-error-{statusCode}</div>,
}));

describe("GlobalError", () => {
  it("captures the error with Sentry", async () => {
    const error = new Error("boom");
    const { default: GlobalError } = await import("./global-error");
    const markup = renderToStaticMarkup(<GlobalError error={error} />);

    expect(markup).toContain("next-error-0");
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});
