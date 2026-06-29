'use server'

export async function unlockDeploymentAction(pin: string): Promise<{ error: string } | undefined> {
  void pin
  return { error: 'Use /api/login to unlock RBHQ.' }
}

export async function loginAction(username: string, pin: string): Promise<{ error: string } | never> {
  void username
  void pin

  return { error: 'Direct login action is disabled. Use /api/login with CSRF.' }
}
