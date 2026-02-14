import { render, screen, waitFor } from "@testing-library/react";
import SharedNotePage from "./page";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { useSearchParams } from "next/navigation";
import { getSharedNote } from "@/lib/api";

// Mocks
vi.mock("next/navigation", () => ({
    useSearchParams: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
    getSharedNote: vi.fn(),
    ApiError: class extends Error {
        status: number;
        constructor(status: number, message: string) {
            super(message);
            this.status = status;
        }
    },
}));

// Mock ReactMarkdown since it can be complex to render in tests
vi.mock("react-markdown", () => ({
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("remark-gfm", () => ({
    default: () => { },
}));

describe("SharedNotePage", () => {
    const mockSearchParams = {
        get: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (useSearchParams as Mock).mockReturnValue(mockSearchParams);
    });

    it("renders loading state initially", () => {
        mockSearchParams.get.mockReturnValue("valid-token");
        (getSharedNote as Mock).mockReturnValue(new Promise(() => { })); // Never resolves to keep loading

        render(<SharedNotePage />);
        // Loader2Icon is rendered
        expect(document.querySelector(".animate-spin")).toBeInTheDocument();
    });

    it("renders error state when token is missing", async () => {
        mockSearchParams.get.mockReturnValue(null);

        render(<SharedNotePage />);

        await waitFor(() => {
            expect(screen.getByText("Not Found")).toBeInTheDocument();
            expect(screen.getByText("Invalid share link - no token provided")).toBeInTheDocument();
        });
    });

    it("renders error state when API fails", async () => {
        mockSearchParams.get.mockReturnValue("invalid-token");
        (getSharedNote as Mock).mockRejectedValue(new Error("API Error"));

        render(<SharedNotePage />);

        await waitFor(() => {
            expect(screen.getByText("Not Found")).toBeInTheDocument();
            expect(screen.getByText("Failed to load the shared note.")).toBeInTheDocument();
        });
    });

    it("renders the shared note content and conversion elements when loaded successfully", async () => {
        mockSearchParams.get.mockReturnValue("valid-token");
        const mockNote = {
            id: "1",
            title: "Test Note",
            content: "# Hello World",
            updated_at: new Date().toISOString(),
        };
        (getSharedNote as Mock).mockResolvedValue(mockNote);

        render(<SharedNotePage />);

        await waitFor(() => {
            expect(screen.getByText("Test Note")).toBeInTheDocument();
            expect(screen.getByText("# Hello World")).toBeInTheDocument();
        });

        // Verification of Conversion Elements

        // Header Buttons
        // Since "Log In" appears in both Nav and Footer, we expect at least 2
        const loginButtons = screen.getAllByText("Log In");
        expect(loginButtons.length).toBeGreaterThanOrEqual(1);

        // "Sign Up Free" appears in Nav
        // "Sign Up" appears in Footer
        // Let's check specifically for "Sign Up Free"
        const signUpFreeButtons = screen.getAllByText("Sign Up Free");
        expect(signUpFreeButtons.length).toBeGreaterThanOrEqual(1);

        // expect(screen.getByText("Save to my account")).toBeInTheDocument(); // Removed per user request

        // Footer CTA
        expect(screen.getByText("Create your own notes with AI")).toBeInTheDocument();

        const getStartedButtons = screen.getAllByText("Get Started Free");
        expect(getStartedButtons.length).toBeGreaterThanOrEqual(1);

        // Verify Links
        const loginLink = loginButtons[0].closest("a");
        expect(loginLink).toHaveAttribute("href", "/login");

        const signUpLink = signUpFreeButtons[0].closest("a");
        expect(signUpLink).toHaveAttribute("href", "/register");

        const getStartedLink = getStartedButtons[0].closest("a");
        expect(getStartedLink).toHaveAttribute("href", "/register");
    });
});
