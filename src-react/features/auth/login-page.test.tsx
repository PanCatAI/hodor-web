import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { readSession } from "@react/lib/auth/session";
import type { PancatLoginSession } from "@react/lib/auth/types";
import { LoginPage } from "./login-page";

const session: PancatLoginSession = {
  token: "Bearer pancat-session",
  id: "operator",
  name: "operator",
  partnerId: "pancat",
  partnerName: "PanCat",
  role: "super_admin",
};

describe("Pancat login page", () => {
  it("requires an account and password", async () => {
    render(<LoginPage login={vi.fn()} onAuthenticated={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请输入 Pancat 账号和密码");
  });

  it("stores the compatible session after login", async () => {
    const login = vi.fn(async () => session);
    const onAuthenticated = vi.fn();
    render(<LoginPage login={login} onAuthenticated={onAuthenticated} />);

    fireEvent.change(screen.getByLabelText("Pancat 账号"), { target: { value: "operator" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledOnce());
    expect(login).toHaveBeenCalledWith({ username: "operator", password: "secret" });
    expect(readSession()).toEqual(session);
  });

  it("shows the server error without losing the entered account", async () => {
    const login = vi.fn(async () => {
      throw new Error("账号或密码错误");
    });
    render(<LoginPage login={login} onAuthenticated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Pancat 账号"), { target: { value: "operator" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("账号或密码错误");
    expect(screen.getByLabelText("Pancat 账号")).toHaveValue("operator");
  });
});
