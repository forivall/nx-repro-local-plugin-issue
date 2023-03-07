export async function dynamicDep() {
  return (await import('@repro-local-plugin-issue/dep/dynamic')).default;
}
