import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { DiffView } from "./DiffView";

// Mock useTranslation hook
vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const texts: Record<string, string> = {
        "aiEdit.accept": "Accept",
        "aiEdit.reject": "Reject",
        "aiEdit.accepted": "Edit applied",
        "aiEdit.rejected": "Edit rejected",
      };
      return texts[key] || key;
    },
  }),
}));

describe("DiffView", () => {
  const defaultProps = {
    originalContent: "Hello world\nLine 2",
    editedContent: "Hello World\nLine 2\nLine 3",
    onAccept: vi.fn(),
    onReject: vi.fn(),
  };

  it("renders diff with added and removed lines", () => {
    const { container } = render(<DiffView {...defaultProps} />);

    // Check diff view is rendered
    const diffView = container.querySelector('[data-testid="diff-view"]');
    expect(diffView).toBeTruthy();

    // Check for + and - markers
    const text = container.textContent || "";
    expect(text).toContain("+");
    expect(text).toContain("-");
  });

  it("renders accept and reject buttons", () => {
    const { getByTestId } = render(<DiffView {...defaultProps} />);

    expect(getByTestId("diff-accept-button")).toBeTruthy();
    expect(getByTestId("diff-reject-button")).toBeTruthy();
  });

  it("calls onAccept when accept button is clicked", () => {
    const onAccept = vi.fn();
    const { getByTestId } = render(
      <DiffView {...defaultProps} onAccept={onAccept} />
    );

    fireEvent.click(getByTestId("diff-accept-button"));
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it("calls onReject when reject button is clicked", () => {
    const onReject = vi.fn();
    const { getByTestId } = render(
      <DiffView {...defaultProps} onReject={onReject} />
    );

    fireEvent.click(getByTestId("diff-reject-button"));
    expect(onReject).toHaveBeenCalledOnce();
  });

  it("shows accepted state when isApplied is 'accepted'", () => {
    const { getByTestId } = render(
      <DiffView {...defaultProps} isApplied="accepted" />
    );

    const resolved = getByTestId("diff-resolved");
    expect(resolved.textContent).toContain("Edit applied");
  });

  it("shows rejected state when isApplied is 'rejected'", () => {
    const { getByTestId } = render(
      <DiffView {...defaultProps} isApplied="rejected" />
    );

    const resolved = getByTestId("diff-resolved");
    expect(resolved.textContent).toContain("Edit rejected");
  });

  it("does not show buttons when isApplied is set", () => {
    const { queryByTestId } = render(
      <DiffView {...defaultProps} isApplied="accepted" />
    );

    expect(queryByTestId("diff-accept-button")).toBeNull();
    expect(queryByTestId("diff-reject-button")).toBeNull();
  });

  it("fullSizeのとき差分ラッパーがflex classを持つ", () => {
    const { container } = render(<DiffView {...defaultProps} fullSize />);
    expect(container.querySelector('[data-testid="diff-view"]')?.className).toContain("flex");
  });
});
