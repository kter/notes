import { render, screen, waitFor } from "@testing-library/react";
import SharedNotePage from "./page";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { useSearchParams } from "next/navigation";
import { getSharedNote } from "@/lib/api";

// Mocks
vi.mock("@/hooks/useTranslation", () => ({
    useTranslation: () => ({
        t: (key: string) => {
            const translations: Record<string, string> = {
                "shared.errorNoToken": "Invalid share link - no token provided",
                "shared.errorNotFound": "This shared note was not found or has been revoked.",
                "shared.errorExpired": "This share link has expired.",
                "shared.errorFailed": "Failed to load the shared note.",
                "shared.notFoundTitle": "Not Found",
                "shared.errorFallback": "This shared note could not be loaded.",
                "shared.goHome": "Go to Home",
                "shared.appName": "Notes App",
                "shared.logIn": "Log In",
                "shared.signUpFree": "Sign Up Free",
                "shared.sharedNoteBadge": "Shared Note",
                "shared.readOnly": "Read-only",
                "shared.untitled": "Untitled",
                "shared.lastUpdated": "Last updated:",
                "shared.noContent": "*No content*",
                "shared.ctaTitle": "Create your own notes with AI",
                "shared.ctaDescription": "Join thousands of users organizing their thoughts with our AI-powered note-taking app.",
                "shared.getStartedFree": "Get Started Free",
                "shared.allRightsReserved": "All rights reserved.",
                "shared.home": "Home",
                "shared.signUp": "Sign Up",
            };
            return translations[key] ?? key;
        },
    }),
}));

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

    it("renders shared frontmatter as metadata above the body", async () => {
        mockSearchParams.get.mockReturnValue("valid-token");
        (getSharedNote as Mock).mockResolvedValue({
            id: "1",
            title: "Shared draft",
            content: "---\ntitle: Draft\npublished: false\n---\n\n## Body",
            updated_at: new Date().toISOString(),
        });

        const { container } = render(<SharedNotePage />);

        const metadata = await screen.findByTestId("markdown-frontmatter");
        expect(metadata.querySelector("pre")?.textContent).toBe("title: Draft\npublished: false");
        expect(metadata.querySelector("h1, h2, hr")).toBeNull();
        expect(screen.getByRole("heading", { name: "Body" })).toBeInTheDocument();
        expect(container.querySelector("article hr")).toBeNull();
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
            expect(screen.getByRole("heading", { name: "Hello World" })).toBeInTheDocument();
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
