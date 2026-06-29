import { spawn } from 'node:child_process'

export async function runCommand(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }

      reject(
        new Error(
          [stderr.trim(), stdout.trim()].filter(Boolean).join('\n') ||
            `${command} exited with code ${code ?? 'unknown'}.`,
        ),
      )
    })
  })
}
