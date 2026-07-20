import { useState, type FormEvent } from "react";

import { Button } from "@react/components/ui/button";
import { Input } from "@react/components/ui/input";
import { Label } from "@react/components/ui/label";
import { useLogin, type LoginFunction } from "./use-login";

interface LoginFormProps {
  login: LoginFunction;
  onAuthenticated: () => void;
}

export function LoginForm({ login, onAuthenticated }: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { error, isSubmitting, submit } = useLogin(login, onAuthenticated);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit({ username, password });
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="pancat-account">Pancat 账号</Label>
        <Input
          id="pancat-account"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="请输入账号"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pancat-password">密码</Label>
        <Input
          id="pancat-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="请输入密码"
        />
      </div>
      {error ? (
        <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}
      <Button className="w-full" size="lg" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "正在登录…" : "登录"}
      </Button>
    </form>
  );
}
