"use client";

import { useTransition } from "react";

type UserOption = {
  id: string;
  displayName: string;
  isAdmin: boolean;
};

export function TestModeFooter({
  users,
  currentUserId,
}: {
  users: UserOption[];
  currentUserId: string | null;
}) {
  const [pending, startTransition] = useTransition();

  function switchTo(userId: string) {
    startTransition(async () => {
      await fetch("/api/mock-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      window.location.reload();
    });
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        left: 12,
        right: 12,
        zIndex: 50,
        display: "flex",
        gap: 8,
        alignItems: "center",
        padding: "8px 12px",
        background: "var(--color-surface-3)",
        borderRadius: 999,
        maxWidth: "fit-content",
        margin: "0 auto",
        pointerEvents: "auto",
      }}
    >
      <span
        className="t-caption"
        style={{
          color: "var(--color-text-muted)",
          letterSpacing: ".08em",
          textTransform: "uppercase",
          marginRight: 4,
        }}
      >
        テスト中 / 切替
      </span>
      <select
        value={currentUserId ?? ""}
        onChange={(e) => switchTo(e.target.value)}
        disabled={pending}
        style={{
          background: "var(--color-bg)",
          border: "1px solid var(--color-border)",
          borderRadius: 999,
          padding: "4px 12px",
          fontSize: "0.786rem",
          fontFamily: "inherit",
          color: "var(--color-text)",
          cursor: pending ? "wait" : "pointer",
          outline: "none",
        }}
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.isAdmin ? "★ " : ""}
            {u.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}
