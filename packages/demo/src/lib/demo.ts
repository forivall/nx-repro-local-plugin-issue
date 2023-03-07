export async function dynamicDep() {
  // nx-ignore-next-line
  return (await import('@repro-local-plugin-issue/dep/dynamic')).default;
}
