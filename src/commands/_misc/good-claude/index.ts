export default {
  type: 'local' as const,
  name: 'stub',
  description: 'stub',
  isEnabled: () => false,
  isHidden: true,
  supportsNonInteractive: false,
  load: () =>
    Promise.resolve({ call: async () => ({ type: 'skip' as const }) }),
}
