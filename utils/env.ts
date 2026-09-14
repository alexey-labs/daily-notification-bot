export function getEnv(key: string): string | undefined {
  return process.env[key];
}

export function getEnvOfThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing Env variable for ${key}`);
  }
  return value;
}
