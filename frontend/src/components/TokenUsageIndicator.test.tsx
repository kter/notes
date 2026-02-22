import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { TokenUsageIndicator } from "./TokenUsageIndicator";

// Mock useTranslation hook
vi.mock("@/hooks/useTranslation", () => ({
    useTranslation: () => ({
        t: (key: string) => {
            const texts: Record<string, string> = {
                "tokenUsage.title": "Language Model Token Usage",
                "tokenUsage.resetDate": "Reset Date",
            };
            return texts[key] || key;
        },
    }),
}));

describe("TokenUsageIndicator", () => {
    it("renders safe usage correctly with green text", () => {
        const { getByText, getByTestId } = render(
            <TokenUsageIndicator
                tokensUsed={100}
                tokenLimit={1000000}
                resetDate="2026-03-01T00:00:00Z"
            />
        );

        const indicator = getByTestId("token-usage-indicator");
        expect(indicator).toBeInTheDocument();

        // Check formatted numbers
        expect(getByText("100")).toBeInTheDocument();
        expect(getByText("1,000,000")).toBeInTheDocument();
        expect(getByText("100")).toHaveClass("text-green-500");
    });

    it("renders warning usage correctly with yellow text", () => {
        const { getByText } = render(
            <TokenUsageIndicator
                tokensUsed={750000}
                tokenLimit={1000000}
                resetDate="2026-03-01T00:00:00Z"
            />
        );

        expect(getByText("750,000")).toHaveClass("text-yellow-500");
    });

    it("renders critical usage correctly with red text", () => {
        const { getByText } = render(
            <TokenUsageIndicator
                tokensUsed={950000}
                tokenLimit={1000000}
                resetDate="2026-03-01T00:00:00Z"
            />
        );

        expect(getByText("950,000")).toHaveClass("text-red-500");
    });

    it("handles invalid dates gracefully", () => {
        render(
            <TokenUsageIndicator
                tokensUsed={0}
                tokenLimit={1000000}
                resetDate="invalid-date"
            />
        );

        expect(document.querySelector(".text-muted-foreground")).toBeInTheDocument();
    });
});
