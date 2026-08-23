import { spawn, type ChildProcess } from "node:child_process";

export interface ProcessInvocation {
  readonly program: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
}

export interface ProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ProcessTransport {
  readonly materializesOutputFiles?: boolean;
  run(invocation: ProcessInvocation): Promise<ProcessResult>;
}

function terminateProcessGroup(child: ChildProcess): void {
  if (process.platform !== "win32" && child.pid !== undefined) {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      // Fall back to the direct child if it exited before its process group was signalled.
    }
  }
  child.kill("SIGKILL");
}

export class SpawnProcessTransport implements ProcessTransport {
  readonly materializesOutputFiles = true;

  async run(invocation: ProcessInvocation): Promise<ProcessResult> {
    return await new Promise((resolve, reject) => {
      const child = spawn(invocation.program, [...invocation.args], {
        cwd: invocation.cwd,
        env: { ...invocation.environment },
        detached: process.platform !== "win32",
        shell: false,
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";
      let outputBytes = 0;
      let settled = false;

      const stop = (error: Error) => {
        if (settled) return;
        settled = true;
        terminateProcessGroup(child);
        reject(error);
      };
      const collect = (current: string, chunk: Buffer): string => {
        outputBytes += chunk.byteLength;
        if (outputBytes > invocation.maxOutputBytes) stop(new Error("agent output budget exceeded"));
        return current + chunk.toString("utf8");
      };
      child.stdout.on("data", (chunk: Buffer) => { stdout = collect(stdout, chunk); });
      child.stderr.on("data", (chunk: Buffer) => { stderr = collect(stderr, chunk); });
      child.once("error", stop);
      const timer = setTimeout(() => stop(new Error("agent timeout budget exceeded")), invocation.timeoutMs);
      timer.unref();
      child.once("close", (code) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        resolve({ exitCode: code ?? 1, stdout, stderr });
      });
    });
  }
}
