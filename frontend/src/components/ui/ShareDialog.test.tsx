import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShareDialog } from "./ShareDialog";

// Mock useTranslation
vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "share.title": "Share Note",
        "share.description": "Anyone with the link can view this note",
        "share.copied": "Link copied to clipboard!",
        "share.viewOnlyNotice": "This link provides read-only access",
        "share.revokeShare": "Revoke",
        "share.noShare": "This note is not shared yet",
        "share.createShare": "Create Share Link",
        "share.revokeConfirm": "Are you sure you want to revoke this share link?",
      };
      return translations[key] || key;
    },
  }),
}));

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
};
Object.assign(navigator, { clipboard: mockClipboard });

// Mock window.confirm
const mockConfirm = vi.fn();
window.confirm = mockConfirm;

describe("ShareDialog", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    shareUrl: null,
    isLoading: false,
    onCreateShare: vi.fn(),
    onRevokeShare: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Loading state", () => {
    it("shows loading spinner when isLoading is true", () => {
      render(<ShareDialog {...defaultProps} isLoading={true} />);
      
      expect(screen.getByTestId("share-dialog")).toBeInTheDocument();
      // Loading spinner should be visible (Loader2Icon with animate-spin class)
      const spinner = document.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });
  });

  describe("No share state", () => {
    it("shows create share button when shareUrl is null", () => {
      render(<ShareDialog {...defaultProps} shareUrl={null} />);
      
      expect(screen.getByText("This note is not shared yet")).toBeInTheDocument();
      expect(screen.getByTestId("share-create-button")).toBeInTheDocument();
    });

    it("calls onCreateShare when create button is clicked", () => {
      render(<ShareDialog {...defaultProps} shareUrl={null} />);
      
      fireEvent.click(screen.getByTestId("share-create-button"));
      
      expect(defaultProps.onCreateShare).toHaveBeenCalledTimes(1);
    });
  });

  describe("Share exists state", () => {
    const propsWithUrl = {
      ...defaultProps,
      shareUrl: "https://example.com/shared?token=abc123",
    };

    it("displays the share URL in an input field", () => {
      render(<ShareDialog {...propsWithUrl} />);
      
      const input = screen.getByTestId("share-url-input") as HTMLInputElement;
      expect(input).toBeInTheDocument();
      expect(input.value).toBe("https://example.com/shared?token=abc123");
      expect(input).toHaveAttribute("readOnly");
    });

    it("shows copy button", () => {
      render(<ShareDialog {...propsWithUrl} />);
      
      expect(screen.getByTestId("share-copy-button")).toBeInTheDocument();
    });

    it("copies URL to clipboard when copy button is clicked", async () => {
      render(<ShareDialog {...propsWithUrl} />);
      
      fireEvent.click(screen.getByTestId("share-copy-button"));
      
      expect(mockClipboard.writeText).toHaveBeenCalledWith(
        "https://example.com/shared?token=abc123"
      );
      
      // Should show "copied" message
      await waitFor(() => {
        expect(screen.getByText("Link copied to clipboard!")).toBeInTheDocument();
      });
    });

    it("shows revoke button", () => {
      render(<ShareDialog {...propsWithUrl} />);
      
      expect(screen.getByTestId("share-revoke-button")).toBeInTheDocument();
      expect(screen.getByText("Revoke")).toBeInTheDocument();
    });

    it("calls onRevokeShare when revoke is confirmed", () => {
      mockConfirm.mockReturnValue(true);
      render(<ShareDialog {...propsWithUrl} />);
      
      fireEvent.click(screen.getByTestId("share-revoke-button"));
      
      expect(mockConfirm).toHaveBeenCalledWith(
        "Are you sure you want to revoke this share link?"
      );
      expect(propsWithUrl.onRevokeShare).toHaveBeenCalledTimes(1);
    });

    it("does not call onRevokeShare when revoke is cancelled", () => {
      mockConfirm.mockReturnValue(false);
      render(<ShareDialog {...propsWithUrl} />);
      
      fireEvent.click(screen.getByTestId("share-revoke-button"));
      
      expect(mockConfirm).toHaveBeenCalled();
      expect(propsWithUrl.onRevokeShare).not.toHaveBeenCalled();
    });

    it("shows read-only notice", () => {
      render(<ShareDialog {...propsWithUrl} />);
      
      expect(screen.getByText("This link provides read-only access")).toBeInTheDocument();
    });
  });

  describe("Dialog behavior", () => {
    it("renders dialog title and description", () => {
      render(<ShareDialog {...defaultProps} shareUrl={null} />);
      
      expect(screen.getByText("Share Note")).toBeInTheDocument();
      expect(screen.getByText("Anyone with the link can view this note")).toBeInTheDocument();
    });
  });
});
