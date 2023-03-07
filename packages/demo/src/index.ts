import staticDep from '@repro-local-plugin-issue/dep';

export * from './lib/demo';

export function demo(): string {
  return `demo ${staticDep}`;
}
